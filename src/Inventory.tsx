import { ChevronDown, PackageOpen } from "lucide-react";
import type { Item } from "../shared/types";
import "./inventory-art.css";

type ObjectArt = { label: string } & (
  { path: string } | { cell: readonly [column: number, row: number] }
);
const blankToken: ObjectArt = {
  cell: [1, 2],
  label: "Brass · worn edges",
};
const objectArt: Record<string, ObjectArt> = {
  "pocket-knife": {
    path: "/art/pocket-knife-sunburst.webp",
    label: "Steel · walnut · brass",
  },
  "field-notebook": {
    path: "/art/field-notebook-sunburst.webp",
    label: "Paper · cloth · graphite",
  },
  "ancient-talisman": {
    path: "/art/ancient-talisman-sunburst.webp",
    label: "Carved metal · aged patina",
  },
  talisman: {
    path: "/art/ancient-talisman-sunburst.webp",
    label: "Carved metal · aged patina",
  },
  "rescue-flint": { cell: [0, 0], label: "Flint · chipped facets" },
  "rescue-canvas": { cell: [1, 0], label: "Canvas · folded cloth" },
  "rescue-rope": { cell: [2, 0], label: "Rope · coiled fibres" },
  "rescue-compass": { cell: [0, 1], label: "Brass · glass · needle" },
  "tide-chart": { cell: [1, 1], label: "Paper · salt-worn folds" },
  "keeper-log": { cell: [2, 1], label: "Cloth · weathered pages" },
  "signal-lens": { cell: [0, 2], label: "Glass · brass rim" },
  "word-we": blankToken,
  "word-will": blankToken,
  "word-find": blankToken,
  "word-home": blankToken,
};

export function Inventory({ items, owner }: { items: Item[]; owner: string }) {
  const count = items.reduce((total, item) => total + item.quantity, 0);
  return (
    <section className="inventory" aria-label={`${owner}'s inventory`}>
      <h3 className="inventory-title">
        Carried objects <small>{count}</small>
      </h3>
      {items.length ? (
        <ul className="inventory-list">
          {items.map((item) => {
            const art = objectArt[item.id];
            return (
              <li key={item.id}>
                <details className="specimen">
                  <summary>
                    <span className={`specimen-art ${art ? "" : "unrecorded"}`}>
                      {art ? (
                        "cell" in art ? (
                          <span
                            className="inventory-specimen-cell"
                            aria-hidden="true"
                            style={{
                              backgroundPosition: `${art.cell[0] * 50}% ${art.cell[1] * 50}%`,
                            }}
                          />
                        ) : (
                          <img src={art.path} alt="" loading="lazy" />
                        )
                      ) : (
                        <PackageOpen
                          size={26}
                          strokeWidth={1}
                          aria-hidden="true"
                        />
                      )}
                    </span>
                    <span className="specimen-label">
                      <strong>{item.name}</strong>
                      <small>{art?.label ?? "Collected in the field"}</small>
                    </span>
                    {item.quantity > 1 && (
                      <span className="specimen-quantity">
                        ×{item.quantity}
                      </span>
                    )}
                    <ChevronDown size={15} aria-hidden="true" />
                  </summary>
                  <p className="specimen-description">{item.description}</p>
                </details>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="empty-inventory">No objects yet.</p>
      )}
    </section>
  );
}
