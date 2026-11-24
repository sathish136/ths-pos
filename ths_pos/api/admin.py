# Copyright (c) 2026, THS
"""Admin / stock / report APIs for React POS customizations."""

import json

import frappe
from frappe import _
from frappe.utils import flt, today


@frappe.whitelist()
def save_menu_item(item=None):
	"""Create/update a THS POS menu item + prices."""
	if item is None:
		item = frappe.request.get_json(silent=True) or frappe.form_dict
	if isinstance(item, str):
		item = json.loads(item)

	code = item.get("code") or item.get("id") or item.get("item_code")
	if not code:
		frappe.throw(_("Item code required"))
	if not str(code).startswith("THS-POS-"):
		code = f"THS-POS-{code}".upper().replace(" ", "-")[:40]

	name = item.get("name") or code
	if frappe.db.exists("Item", code):
		doc = frappe.get_doc("Item", code)
		doc.item_name = name
		doc.description = item.get("category") or doc.description
		doc.save(ignore_permissions=True)
	else:
		doc = frappe.get_doc(
			{
				"doctype": "Item",
				"item_code": code,
				"item_name": name,
				"item_group": "Food" if frappe.db.exists("Item Group", "Food") else "All Item Groups",
				"stock_uom": "Nos",
				"is_stock_item": 0,
				"is_sales_item": 1,
				"description": item.get("category") or "",
			}
		)
		doc.insert(ignore_permissions=True)

	prices = item.get("prices") or {}
	default = flt(item.get("price") or 0)
	for pl, rate in (
		("Dine in", prices.get("Dine in", default)),
		("Takeaway", prices.get("Takeaway", default)),
		("Delivery", prices.get("Delivery", default)),
	):
		if not frappe.db.exists("Price List", pl):
			continue
		existing = frappe.db.exists("Item Price", {"item_code": code, "price_list": pl, "selling": 1})
		if existing:
			frappe.db.set_value("Item Price", existing, "price_list_rate", flt(rate))
		else:
			frappe.get_doc(
				{
					"doctype": "Item Price",
					"item_code": code,
					"price_list": pl,
					"selling": 1,
					"price_list_rate": flt(rate),
				}
			).insert(ignore_permissions=True)

	frappe.db.commit()
	return {"code": code, "name": name}


@frappe.whitelist()
def set_item_available(item_code, available=1):
	if not frappe.db.exists("Item", item_code):
		frappe.throw(_("Item not found"))
	# Use disabled flag: available=0 -> disabled=1
	frappe.db.set_value("Item", item_code, "disabled", 0 if int(available) else 1)
	frappe.db.commit()
	return {"ok": True}


@frappe.whitelist()
def stock_ledger(limit=50):
	rows = frappe.get_all(
		"Stock Ledger Entry",
		fields=["item_code", "warehouse", "actual_qty", "qty_after_transaction", "posting_date", "voucher_type", "voucher_no"],
		order_by="posting_date desc, posting_time desc",
		limit_page_length=int(limit or 50),
	)
	return rows


@frappe.whitelist()
def stock_balance():
	rows = frappe.db.sql(
		"""
		SELECT item_code, warehouse, actual_qty
		FROM `tabBin`
		WHERE actual_qty != 0
		ORDER BY item_code, warehouse
		LIMIT 200
		""",
		as_dict=True,
	)
	return rows


@frappe.whitelist()
def receive_stock(item_code, qty, warehouse=None, rate=1):
	company = frappe.db.get_single_value("Global Defaults", "default_company")
	if not warehouse:
		warehouse = frappe.db.get_value("Warehouse", {"company": company, "is_group": 0}, "name")
	se = frappe.get_doc(
		{
			"doctype": "Stock Entry",
			"stock_entry_type": "Material Receipt",
			"company": company,
			"items": [
				{
					"item_code": item_code,
					"qty": flt(qty),
					"t_warehouse": warehouse,
					"basic_rate": flt(rate),
				}
			],
		}
	)
	se.insert(ignore_permissions=True)
	se.submit()
	return {"stock_entry": se.name}


@frappe.whitelist()
def transfer_stock(item_code, qty, from_warehouse, to_warehouse):
	company = frappe.db.get_single_value("Global Defaults", "default_company")
	se = frappe.get_doc(
		{
			"doctype": "Stock Entry",
			"stock_entry_type": "Material Transfer",
			"company": company,
			"items": [
				{
					"item_code": item_code,
					"qty": flt(qty),
					"s_warehouse": from_warehouse,
					"t_warehouse": to_warehouse,
				}
			],
		}
	)
	se.insert(ignore_permissions=True)
	se.submit()
	return {"stock_entry": se.name}


@frappe.whitelist()
def sales_report(date=None):
	date = date or today()
	rows = frappe.get_all(
		"POS Invoice",
		filters={"docstatus": 1, "posting_date": date},
		fields=["name", "customer", "grand_total", "paid_amount", "posting_time", "restaurant_table", "owner"],
		order_by="posting_time",
	)
	total = sum(flt(r.grand_total) for r in rows)
	return {"date": date, "count": len(rows), "total": total, "invoices": rows}


@frappe.whitelist()
def save_recipe(item_code, ingredients=None):
	"""Create/update a simple BOM for a menu item."""
	if ingredients is None:
		ingredients = frappe.request.get_json(silent=True) or []
	if isinstance(ingredients, str):
		ingredients = json.loads(ingredients)
	if not frappe.db.exists("Item", item_code):
		frappe.throw(_("Menu item not found"))

	# Ensure ingredient items exist as stock items
	bom_items = []
	for ing in ingredients or []:
		code = ing.get("code") or ing.get("item_code")
		qty = flt(ing.get("qty") or 1)
		if not code:
			continue
		if not frappe.db.exists("Item", code):
			frappe.get_doc(
				{
					"doctype": "Item",
					"item_code": code,
					"item_name": ing.get("name") or code,
					"item_group": "Raw Material" if frappe.db.exists("Item Group", "Raw Material") else "All Item Groups",
					"stock_uom": "Nos",
					"is_stock_item": 1,
				}
			).insert(ignore_permissions=True)
		bom_items.append({"item_code": code, "qty": qty})

	existing = frappe.db.get_value("BOM", {"item": item_code, "is_active": 1, "docstatus": 1}, "name")
	if existing:
		# Create new version
		pass
	if not bom_items:
		return {"ok": False, "reason": "No ingredients"}

	bom = frappe.get_doc(
		{
			"doctype": "BOM",
			"item": item_code,
			"quantity": 1,
			"is_active": 1,
			"is_default": 1,
			"items": bom_items,
		}
	)
	bom.insert(ignore_permissions=True)
	bom.submit()
	return {"bom": bom.name}


def _config_path():
	import os

	folder = frappe.get_site_path("private", "files")
	os.makedirs(folder, exist_ok=True)
	return os.path.join(folder, "ths_pos_config.json")


def _read_config():
	import os

	path = _config_path()
	if not os.path.exists(path):
		cached = frappe.cache().get_value("ths_pos:config")
		return cached or {}
	try:
		with open(path, encoding="utf-8") as f:
			return json.load(f)
	except Exception:
		return {}


def _write_config(data):
	path = _config_path()
	with open(path, "w", encoding="utf-8") as f:
		json.dump(data, f, indent=2, default=str)
	frappe.cache().set_value("ths_pos:config", data)


@frappe.whitelist()
def get_config():
	"""Settings / extras / features / recipes UI state persisted for React POS."""
	return _read_config()


@frappe.whitelist()
def save_config(config=None):
	"""Merge and persist React Admin/Settings/Features into site private file + cache."""
	if config is None:
		config = frappe.request.get_json(silent=True) or frappe.form_dict
	if isinstance(config, str):
		config = json.loads(config)
	if not isinstance(config, dict):
		frappe.throw(_("Invalid config"))
	existing = _read_config()
	existing.update(config)
	existing["updated_at"] = str(frappe.utils.now_datetime())
	existing["updated_by"] = frappe.session.user
	_write_config(existing)

	# Mirror key demo caches used by bootstrap
	if "tables" in config:
		frappe.cache().set_value("ths_pos:tables", config["tables"])
	if "staff" in config:
		frappe.cache().set_value("ths_pos:staff", config["staff"])
		for s in config["staff"] or []:
			if s.get("email"):
				frappe.cache().hset("ths_pos:pins", s["email"], s.get("pin") or "")
			if s.get("roleId"):
				frappe.cache().hset("ths_pos:pins", s["roleId"], s.get("pin") or "")
	if "pins" in config:
		frappe.cache().set_value("ths_pos:pin_overrides", config["pins"])
	if "branches" in config:
		frappe.cache().set_value("ths_pos:branches", config["branches"])
	if "kitchen" in config:
		frappe.cache().set_value("ths_pos:kitchen", config["kitchen"])

	return {"ok": True, "updated_at": existing["updated_at"]}


@frappe.whitelist()
def list_recipes():
	"""Active BOMs for THS-POS menu items → React RecipeBook shape."""
	items = frappe.get_all(
		"Item",
		filters={"item_code": ["like", "THS-POS-%"], "disabled": 0},
		pluck="name",
	)
	out = {}
	for code in items:
		bom = frappe.db.get_value("BOM", {"item": code, "is_active": 1, "docstatus": 1}, "name")
		if not bom:
			continue
		doc = frappe.get_doc("BOM", bom)
		out[code] = [
			{"ingredientId": row.item_code, "qty": flt(row.qty)}
			for row in doc.items
		]
	return out


@frappe.whitelist()
def list_warehouses():
	company = frappe.db.get_single_value("Global Defaults", "default_company")
	rows = frappe.get_all(
		"Warehouse",
		filters={"company": company, "is_group": 0},
		fields=["name", "warehouse_name"],
		limit_page_length=50,
	)
	return rows


@frappe.whitelist()
def write_off_stock(item_code, qty, warehouse=None, reason=None):
	company = frappe.db.get_single_value("Global Defaults", "default_company")
	if not warehouse:
		warehouse = frappe.db.get_value("Warehouse", {"company": company, "is_group": 0}, "name")
	se = frappe.get_doc(
		{
			"doctype": "Stock Entry",
			"stock_entry_type": "Material Issue",
			"company": company,
			"items": [
				{
					"item_code": item_code,
					"qty": flt(qty),
					"s_warehouse": warehouse,
					"basic_rate": 1,
				}
			],
		}
	)
	if reason and se.meta.has_field("remarks"):
		se.remarks = reason
	se.insert(ignore_permissions=True)
	se.submit()
	return {"stock_entry": se.name}
