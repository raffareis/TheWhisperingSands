import { ChevronDown, PackageOpen } from "lucide-react";
import type { Item } from "../shared/types";

const objectArt: Record<string, { path: string; label: string }> = {
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
};

export function Inventory({ items, owner }: { items: Item[]; owner: string }) {
  const count = items.reduce((total, item) => total + item.quantity, 0);
  return (
    <section className="inventory" aria-label={`${owner}'s inventory`}>
      <div className="inventory-title">
        <span>Carried objects</span>
        <small>
          {count} {count === 1 ? "item" : "items"}
        </small>
      </div>
      <div className="inventory-list">
        {items.length ? (
          items.map((item, index) => {
            const art = objectArt[item.id];
            return (
              <details className="specimen" key={item.id}>
                <summary>
                  <span className={`specimen-art ${art ? "" : "unrecorded"}`}>
                    <span className="specimen-number" aria-hidden="true">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    {art ? (
                      <img src={art.path} alt="" loading="lazy" />
                    ) : (
                      <PackageOpen
                        size={36}
                        strokeWidth={1}
                        aria-hidden="true"
                      />
                    )}
                    <span className="specimen-quantity">×{item.quantity}</span>
                  </span>
                  <span className="specimen-label">
                    <strong>{item.name}</strong>
                    <ChevronDown size={15} />
                  </span>
                  <span className="specimen-material">
                    {art?.label ?? "Collected in the field"}
                  </span>
                  <span className="specimen-inspect">Examine object</span>
                </summary>
                <div className="specimen-description">
                  <span>FIELD NOTE</span>
                  <p>{item.description}</p>
                </div>
              </details>
            );
          })
        ) : (
          <div className="empty-inventory">
            <PackageOpen size={27} strokeWidth={1} />
            <p>
              No objects carried.
              <br />
              Finds from the island will appear here.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
