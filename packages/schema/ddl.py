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

        return result


sqltablegen.RelationalModelTransformer = Tables
sqlalchemygen.RelationalModelTransformer = Tables

if "dump" in sys.argv[1:]:
    from linkml.utils.sqlutils import main

    sys.argv = ["linkml-sqldb", "dump", "-s", SCHEMA, "-C", TOP_CLASS,
                "-D", "../gen/catalog.db", "../gen/catalog.yaml"]
    main()
else:
    print(SQLTableGenerator(SchemaView(SCHEMA).schema).generate_ddl(top_class=TOP_CLASS))
