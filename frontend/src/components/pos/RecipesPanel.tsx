import { useState } from 'react';
import { CookingPot, Download, Plus, Trash2 } from 'lucide-react';
import { downloadExcelFile } from '../../lib/excel-export';
import type { MenuItem } from '../../lib/order-process';
import {
  type Ingredient,
  type RecipeBook,
  type RecipeLine,
} from '../../lib/inventory';
import { erpSaveRecipe } from '../../lib/erp-api';

type Props = {
  menu: MenuItem[];
  stock: Ingredient[];
  recipes: RecipeBook;
  canEdit: boolean;
  onChange: (recipes: RecipeBook) => void;
  flash: (msg: string) => void;
};

const qtyLabel = (n: number, unit: string) =>
  `${Number.isInteger(n) ? n : n.toFixed(n < 1 ? 3 : 2)} ${unit}`;

export function RecipesPanel({ menu, stock, recipes, canEdit, onChange, flash }: Props) {
  const [dishId, setDishId] = useState(menu[0]?.id ?? '');
  const [addIng, setAddIng] = useState(stock[0]?.id ?? '');
  const [addQty, setAddQty] = useState('0.1');
  const dish = menu.find((m) => m.id === dishId);
  const lines = recipes[dishId] ?? [];

  function setLines(next: RecipeLine[]) {
    if (!canEdit) {
      flash('Manager edits recipes in this demo');
      return;
    }
    onChange({ ...recipes, [dishId]: next });
    const ingredients = next.map((l) => {
      const ing = stock.find((s) => s.id === l.ingredientId);
      return { code: l.ingredientId, name: ing?.name || l.ingredientId, qty: l.qty };
    });
    void erpSaveRecipe(dishId, ingredients).catch((err) => console.warn('ERP save_recipe', err));
  }

  function updateQty(ingredientId: string, qty: number) {
    setLines(lines.map((l) => (l.ingredientId === ingredientId ? { ...l, qty } : l)));
  }

  function removeLine(ingredientId: string) {
    setLines(lines.filter((l) => l.ingredientId !== ingredientId));
    flash('Ingredient removed from recipe');
  }

  function downloadTemplate() {
    const rows: (string | number)[][] = [];
    for (const m of menu) {
      const linesFor = recipes[m.id] ?? [];
      if (!linesFor.length) {
        rows.push([m.id, m.name, '', '', '', '']);
      } else {
        for (const line of linesFor) {
          const ing = stock.find((x) => x.id === line.ingredientId);
          rows.push([m.id, m.name, line.ingredientId, ing?.name ?? '', line.qty, ing?.unit ?? '']);
        }
      }
    }
    // Blank example rows so they can copy the format
    rows.push(['new-dish-id', 'New dish name', 'ingredient-id', 'Ingredient name', 0.1, 'kg']);
    downloadExcelFile(
      `ury-recipe-template-${Date.now()}.xls`,
      'Recipes',
      ['Dish ID', 'Dish name', 'Ingredient ID', 'Ingredient name', 'Qty per plate', 'Unit'],
      rows,
    );
    flash('Recipe template downloaded');
  }

  function addLine() {
    if (!addIng) return;
    const qty = Number(addQty);
    if (!qty || qty <= 0) {
      flash('Enter a positive qty');
      return;
    }
    if (lines.some((l) => l.ingredientId === addIng)) {
      setLines(lines.map((l) => (l.ingredientId === addIng ? { ...l, qty } : l)));
      flash('Updated qty on existing line');
      return;
    }
    setLines([...lines, { ingredientId: addIng, qty }]);
    flash('Recipe line added');
  }

  return (
    <section className="ury-panel">
      <div className="ury-panel-head">
        <div>
          <div className="ury-eyebrow"><CookingPot size={13} /> RECIPES</div>
          <h1>Item BOM / recipes</h1>
          <p>Set ingredients per dish. Kitchen send deducts these lines into the Ledger.</p>
        </div>
        <div className="ury-action-row">
          <button type="button" className="ury-ghost" onClick={downloadTemplate}>
            <Download size={13} aria-hidden /> Download recipe template
          </button>
        </div>
      </div>

      <div className="ury-form-card" style={{ marginBottom: 16 }}>
        <h3>How to add a recipe</h3>
        <ol className="ury-howto" style={{ margin: '8px 0 0', paddingLeft: 18, lineHeight: 1.55 }}>
          <li>Sign in as <b>Manager</b> (PIN 3333) — only Manager can edit recipes.</li>
          <li>Open the <b>Recipes</b> tab.</li>
          <li>Select a dish on the left (for example Crispy-skin salmon).</li>
          <li>Under <b>Add ingredient</b>, choose the stock item and enter <b>Qty per plate</b>.</li>
          <li>Click <b>Add to recipe</b>. Repeat for every ingredient on that dish.</li>
          <li>When a Captain sends the order to kitchen, stock is deducted and the pull appears in <b>Ledger</b>.</li>
        </ol>
        <p className="ury-muted" style={{ marginTop: 8 }}>
          Template columns: Dish ID, Dish name, Ingredient ID, Ingredient name, Qty per plate, Unit.
          Fill the Excel/CSV template, then enter the same values here (import from file can be added when we connect ERPNext).
        </p>
      </div>

      <div className="ury-recipe-layout">
        <div className="ury-recipe-dishes">
          {menu.map((m) => {
            const count = (recipes[m.id] ?? []).length;
            return (
              <button
                key={m.id}
                type="button"
                className={`ury-recipe-dish ${dishId === m.id ? 'on' : ''}`}
                onClick={() => setDishId(m.id)}
              >
                <strong>{m.name}</strong>
                <small>{count} ingredient{count === 1 ? '' : 's'} · {m.category}</small>
              </button>
            );
          })}
        </div>

        <div className="ury-recipe-editor">
          {!dish ? (
            <p className="ury-muted">Select a dish.</p>
          ) : (
            <>
              <h2>{dish.name}</h2>
              <p className="ury-muted">Recipe for 1 plate · used on Send to kitchen</p>

              {lines.length === 0 ? (
                <p className="ury-muted" style={{ marginTop: 16 }}>No recipe yet — add ingredients below.</p>
              ) : (
                <div className="ury-recipe-lines">
                  {lines.map((line) => {
                    const ing = stock.find((s) => s.id === line.ingredientId);
                    return (
                      <div key={line.ingredientId} className="ury-recipe-line">
                        <div>
                          <strong>{ing?.name ?? line.ingredientId}</strong>
                          <small>On hand {ing ? qtyLabel(ing.onHand, ing.unit) : '—'}</small>
                        </div>
                        <label className="ury-field" style={{ margin: 0, minWidth: 110 }}>
                          <span>Qty / plate</span>
                          <input
                            type="number"
                            step="0.001"
                            min="0"
                            disabled={!canEdit}
                            value={line.qty}
                            onChange={(e) => updateQty(line.ingredientId, Number(e.target.value) || 0)}
                          />
                        </label>
                        <span className="ury-muted">{ing?.unit ?? ''}</span>
                        {canEdit && (
                          <button type="button" className="ury-ghost" style={{ width: 36, padding: 0 }} onClick={() => removeLine(line.ingredientId)} aria-label="Remove">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {canEdit && (
                <div className="ury-form-card" style={{ marginTop: 18 }}>
                  <h3>Add ingredient</h3>
                  <div className="ury-form-row">
                    <label className="ury-field">
                      <span>Ingredient</span>
                      <select value={addIng} onChange={(e) => setAddIng(e.target.value)}>
                        {stock.map((s) => (
                          <option key={s.id} value={s.id}>{s.name} ({s.unit})</option>
                        ))}
                      </select>
                    </label>
                    <label className="ury-field">
                      <span>Qty per plate</span>
                      <input value={addQty} onChange={(e) => setAddQty(e.target.value)} inputMode="decimal" />
                    </label>
                  </div>
                  <button type="button" className="ury-submit" onClick={addLine}>
                    <Plus size={14} /> Add to recipe
                  </button>
                </div>
              )}
              {!canEdit && <p className="ury-muted" style={{ marginTop: 14 }}>View only — Manager can edit recipes.</p>}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
