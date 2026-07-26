"""Schema-to-SQL, replacing the `gen-sqltables` CLI. DDL to stdout.

    python ddl.py [dialect]     dialect defaults to sqlite

One schema, two shipped dialects. The generator is SQLAlchemy-backed, so
`postgresql` costs a keyword and buys what SQLite cannot express: the closed
enums become real `CREATE TYPE … AS ENUM`, and every LinkML description becomes
a `COMMENT ON`, making the database its own introspection surface. Both dialects
carry the same 86 foreign keys; postgres hoists the circular ones into
`ALTER TABLE … ADD CONSTRAINT`.

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

Plus the `coordinate` view, appended verbatim — see VIEW.
"""

import sys

from linkml.generators import sqltablegen
from linkml.generators.sqltablegen import SQLTableGenerator
from linkml.transformers.relmodel_transformer import RelationalModelTransformer
from linkml_runtime.utils.schemaview import SchemaView


SCHEMA = "nodeve.yaml"
TOP_CLASS = "Catalog"
DIALECT = sys.argv[1] if len(sys.argv) > 1 else "sqlite"

# `*` resolved — one row per addressable coordinate (docs/parts.md#-every-member).
# A `*` interval is a TEMPLATE: it states one band for every member of its
# feature's subdivision. Resolving it is a join no LinkML construct reaches —
# `part` is a discriminator column, not an FK, and `*` names no row — so it ships
# as DDL, which every loader already execs.
#
# The view mints NO name. It rewrites the part segment of an existing permalink;
# the identity path stays the only name (docs/ship.md).
#
# One body, both dialects. `count` expands through a recursive CTE, which
# postgres runs verbatim — generate_series would only fork the text. An explicit
# part outranks the default, so an expansion that lands on a real interval's path
# is dropped rather than colliding with it.
VIEW = """

CREATE VIEW coordinate AS
WITH RECURSIVE ordinal(feature, n, total) AS (
\tSELECT node, 1, count FROM feature_of_interest WHERE count IS NOT NULL
\tUNION ALL
\tSELECT feature, n + 1, total FROM ordinal WHERE n < total
),
member(feature, part) AS (
\tSELECT f.node, n.slug
\tFROM feature_of_interest f
\tJOIN part_set_member m ON m.part_set_node = f.part_set
\tJOIN node n ON n.permalink = m.node
\tUNION ALL
\tSELECT feature, CAST(n AS TEXT) FROM ordinal
),
expanded(node, interval, part) AS (
\tSELECT f.node || '/' || m.part || substr(i.node, length(f.node) + length(i.part) + 2),
\t       i.node,
\t       m.part
\tFROM interval i
\tJOIN feature_of_interest f ON f.node = i.feature_of_interest_node
\tJOIN member m ON m.feature = f.node
\tWHERE i.part = '*'
)
SELECT node, node AS interval, part FROM interval WHERE part <> '*'
UNION ALL
SELECT e.node, e.interval, e.part FROM expanded e
WHERE NOT EXISTS (SELECT 1 FROM interval i WHERE i.node = e.node);
"""


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

print(SQLTableGenerator(SchemaView(SCHEMA).schema, dialect=DIALECT).generate_ddl() + VIEW)
