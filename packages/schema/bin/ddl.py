"""Schema-to-SQL, replacing the `gen-sqltables` CLI. DDL to stdout.

Loading the rows is `src/load.ts` — this stays the DDL half so nothing in the
build path needs python beyond emitting the schema.

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
"""

from linkml.generators import sqltablegen
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

        for old, new in renames.items():
            cls = classes.pop(old)
            cls.name = new
            classes[new] = cls

        # The tree-root container is load machinery, not a table — linkml would
        # stamp a surrogate `Catalog` table plus a backref FK on every top-level
        # row-set. `src/load.ts` inserts each row-set into its table directly, so
        # drop the container and its backref columns.
        classes.pop(TOP_CLASS, None)
        for cls in classes.values():
            for attr in [n for n, a in cls.attributes.items() if a.range == TOP_CLASS]:
                del cls.attributes[attr]

        return result


sqltablegen.RelationalModelTransformer = Tables

print(SQLTableGenerator(SchemaView(SCHEMA).schema).generate_ddl())
