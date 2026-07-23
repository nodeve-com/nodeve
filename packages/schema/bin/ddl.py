"""Schema-to-SQL, replacing both the `gen-sqltables` and `linkml-sqldb` CLIs.

    python ddl.py         # DDL to stdout
    python ddl.py dump    # build the SQLite database

Two things no CLI flag reaches, both applied inside the relational transform.
A standalone transform pass is NOT idempotent — it re-suffixes forward FKs,
product_node -> product_node_node — so the mutation has to ride along in the
pass the generators already run.

1. `sql_table` becomes the table name. The transform names tables after classes,
   quoted PascalCase. Renaming the relmodel class and repointing every attribute
   range, foreign_key annotation, and backref column carries the whole graph.

2. Backref FK columns land nullable. The transform synthesizes one per
   inlined_as_list child, but an inlined row only exists under its parent.
   Exception: a class reached from several parents (Content) carries one backref
   per referencing class and fills exactly one, so those stay nullable.

Both generators must be patched: `sqlalchemygen` imports the transformer into
its OWN namespace, so patching `sqltablegen` alone renames the tables but not
the ORM mapping, and every INSERT then targets a table that does not exist.

`RelationalMapping.target_class` is deliberately NOT renamed. The declarative
template interpolates it raw (`foreign_keys="[{{target_class}}.{{slot}}]"`),
where it must name the Python class, while `source_class` keys the backref
lookup and must match the renamed class. The two fields want opposite things.
"""

import sys

from linkml.generators import sqlalchemygen, sqltablegen
from linkml.generators.sqltablegen import SQLTableGenerator
from linkml.transformers.relmodel_transformer import RelationalModelTransformer
from linkml_runtime.utils.schemaview import SchemaView


SCHEMA = "nodeve.yaml"
TOP_CLASS = "Catalog"


def annotation(element, tag):
    """Annotations are JsonObj, which has no .get — membership then index."""
    anns = element.annotations
    return anns[tag] if anns and tag in anns else None


def table_name(cls) -> str:
    """The authored sql_table annotation, or the class name where one is absent."""
    ann = annotation(cls, "sql_table")
    return ann.value if ann else cls.name


def rename_backref(name: str, renames: dict[str, str]) -> str:
    """Backref columns are named for the parent class: Specification_node."""
    parent, sep, col = (name or "").rpartition("_")
    return f"{renames[parent]}{sep}{col}" if sep and parent in renames else name


class Tables(RelationalModelTransformer):
    def transform(self, *args, **kwargs):
        result = super().transform(*args, **kwargs)
        classes = result.schema.classes
        renames = {name: table_name(cls) for name, cls in classes.items()}

        for cls in classes.values():
            backrefs = [a for a in cls.attributes.values() if annotation(a, "backref")]
            if len(backrefs) == 1:
                backrefs[0].required = True
            for attr in cls.attributes.values():
                attr.range = renames.get(attr.range, attr.range)
                attr.name = rename_backref(attr.name, renames)
                fk = annotation(attr, "foreign_key")
                if fk:
                    target, _, col = fk.value.partition(".")
                    fk.value = f"{renames.get(target, target)}.{col}"
            # mutate in place — assigning a fresh dict re-wraps it as a JsonObj,
            # which SchemaView cannot iterate
            renamed = {attr.name: attr for attr in cls.attributes.values()}
            cls.attributes.clear()
            cls.attributes.update(renamed)

        for mapping in result.mappings:
            mapping.source_class = renames.get(mapping.source_class, mapping.source_class)
            mapping.join_class = renames.get(mapping.join_class, mapping.join_class)
            mapping.target_slot = rename_backref(mapping.target_slot, renames)

        for old, new in renames.items():
            cls = classes.pop(old)
            cls.name = new
            classes[new] = cls

        # The tree-root container is load machinery, not a table — linkml would
        # stamp a surrogate `Catalog` table plus a backref FK on every top-level
        # row-set. The loader inserts each row-set into its table directly, so
        # drop the container, its backref columns, and the ORM mappings to it.
        classes.pop(TOP_CLASS, None)
        for cls in classes.values():
            for attr in [n for n, a in cls.attributes.items() if a.range == TOP_CLASS]:
                del cls.attributes[attr]
        result.mappings = [m for m in result.mappings if m.source_class != TOP_CLASS]

        return result


sqltablegen.RelationalModelTransformer = Tables
sqlalchemygen.RelationalModelTransformer = Tables

if "dump" in sys.argv[1:]:
    # LinkML's PythonGenerator bug: it DEFINES a hyphenated CURIE prefix's
    # namespace as `RFC_5424 = CurieNamespace('rfc-5424', …)` (- → _) but emits
    # the enum-meaning REFERENCE unnormalized as `RFC-5424["Notice"]` — invalid
    # Python, `NameError: RFC`. Normalize the reference identifiers (an uppercase
    # hyphenated token before a `[`) in the generated source before it compiles;
    # lowercase prefix strings stay untouched. Lets CURIE prefixes = kebab slugs.
    import os
    import re
    import sqlite3

    from linkml.generators import pythongen
    from linkml.generators.pythongen import PythonGenerator
    from linkml.utils.sqlutils import SQLStore
    from linkml_runtime.loaders import json_loader
    from sqlalchemy.orm import sessionmaker

    _orig_compile = pythongen.compile_python
    _ns_ref = re.compile(r"\b[A-Z][A-Z0-9_]*(?:-[A-Z0-9]+)+(?=\[)")
    pythongen.compile_python = lambda code, *a, **k: _orig_compile(
        _ns_ref.sub(lambda m: m.group(0).replace("-", "_"), code), *a, **k
    )

    # Own the load. linkml-sqldb roots its ORM dump at the container object, which
    # is the ONLY reason a `catalog` table exists. gen/catalog.json is already one
    # row-set per table, so build the tree_root, then insert each row-set straight
    # into its table — the container is never materialized. Nested facets still
    # ride linkml's to_sqla traversal, backref FKs and all.
    DB = "../gen/catalog.db"
    if os.path.exists(DB):
        os.remove(DB)

    native = PythonGenerator(SCHEMA).compile_module()
    bundle = json_loader.load("../gen/catalog.json", target_class=native.__dict__[TOP_CLASS])

    store = SQLStore(SCHEMA, database_path=DB)
    store.native_module = native
    store.db_exists(force=True)  # DDL sans container (Tables drops it)
    store.compile()  # ORM sans container

    row_sets = SchemaView(SCHEMA).get_class(TOP_CLASS).attributes
    with sessionmaker(bind=store.engine).begin() as session:
        for slot in row_sets:
            objs = getattr(bundle, slot, None)
            if not objs:
                continue
            session.add_all(store.to_sqla(objs))

    # SQLite declares but does not enforce FKs by default — this is THE
    # integrity gate: every assembled path must land on a real row.
    bad = sqlite3.connect(DB).execute("PRAGMA foreign_key_check").fetchall()
    if bad:
        sys.exit(f"foreign_key_check: {len(bad)} dangling FK rows, e.g. {bad[:5]}")
else:
    print(SQLTableGenerator(SchemaView(SCHEMA).schema).generate_ddl())
