# Copyright (c) 2026, THS
"""Import React demo master data into ERPNext / URY DocTypes."""

import frappe
from frappe import _
from frappe.utils import cint, flt, now_datetime


# Mirrors React BRANCHES / ROLES / seedTables — keep in sync with frontend libs
DEMO_BRANCHES = [
	{"id": "main", "name": "URY Main Street", "code": "MAIN", "city": "Downtown", "address": "12 Main Street"},
	{"id": "harbor", "name": "URY Harbor", "code": "HBR", "city": "Waterfront", "address": "4 Pier Lane"},
	{"id": "airport", "name": "URY Airport", "code": "APT", "city": "Terminal B", "address": "Gate plaza · T2"},
]

DEMO_MENU = [
	{"code": "THS-POS-BRUS", "name": "Bruschetta", "category": "Small plates", "dine": 9.5, "take": 9.0, "deliv": 10.0},
	{"code": "THS-POS-CALA", "name": "Calamari", "category": "Small plates", "dine": 14.0, "take": 13.0, "deliv": 14.5},
	{"code": "THS-POS-SOUP", "name": "Soup of the Day", "category": "Small plates", "dine": 8.0, "take": 7.5, "deliv": 8.5},
	{"code": "THS-POS-SALM", "name": "Grilled Salmon", "category": "Mains", "dine": 28.0, "take": 26.0, "deliv": 29.0},
	{"code": "THS-POS-STEK", "name": "Ribeye Steak", "category": "Mains", "dine": 36.0, "take": 34.0, "deliv": 37.0},
	{"code": "THS-POS-PAST", "name": "House Pasta", "category": "Mains", "dine": 22.0, "take": 20.0, "deliv": 23.0},
	{"code": "THS-POS-BURG", "name": "Bistro Burger", "category": "Mains", "dine": 18.0, "take": 17.0, "deliv": 19.0},
	{"code": "THS-POS-TIRA", "name": "Tiramisu", "category": "Dessert", "dine": 11.0, "take": 10.0, "deliv": 11.5},
	{"code": "THS-POS-CHEE", "name": "Cheesecake", "category": "Dessert", "dine": 10.0, "take": 9.5, "deliv": 10.5},
]

DEMO_TABLES = [
	{"id": "t04", "name": "Table 04", "zone": "Main", "seats": 2, "shape": "round", "x": 14, "y": 22},
	{"id": "t07", "name": "Table 07", "zone": "Main", "seats": 4, "shape": "square", "x": 32, "y": 20},
	{"id": "t12", "name": "Table 12", "zone": "Main", "seats": 4, "shape": "square", "x": 18, "y": 48},
	{"id": "t16", "name": "Table 16", "zone": "Main", "seats": 8, "shape": "rect", "x": 38, "y": 48},
	{"id": "t09", "name": "Table 09", "zone": "Window", "seats": 2, "shape": "round", "x": 58, "y": 18},
	{"id": "t14", "name": "Table 14", "zone": "Window", "seats": 6, "shape": "rect", "x": 72, "y": 40},
	{"id": "t18", "name": "Table 18", "zone": "Window", "seats": 4, "shape": "square", "x": 58, "y": 48},
	{"id": "p02", "name": "Patio 02", "zone": "Patio", "seats": 4, "shape": "square", "x": 22, "y": 78},
	{"id": "p03", "name": "Patio 03", "zone": "Patio", "seats": 2, "shape": "round", "x": 40, "y": 78},
	{"id": "p04", "name": "Patio 04", "zone": "Patio", "seats": 6, "shape": "rect", "x": 60, "y": 78},
	{"id": "b01", "name": "Bar 01", "zone": "Bar", "seats": 1, "shape": "bar", "x": 84, "y": 16},
	{"id": "b02", "name": "Bar 02", "zone": "Bar", "seats": 1, "shape": "bar", "x": 92, "y": 16},
]

# PINs match React ROLES (roles.ts)
DEMO_STAFF = [
	{"email": "captain@ths.pos", "first": "Captain", "last": "One", "role": "URY Captain", "pin": "1111", "role_id": "captain"},
	{"email": "cashier@ths.pos", "first": "Cashier", "last": "One", "role": "URY Cashier", "pin": "2222", "role_id": "cashier"},
	{"email": "cashier2@ths.pos", "first": "Cashier", "last": "Two", "role": "URY Cashier", "pin": "2223", "role_id": "cashier2"},
	{"email": "supervisor@ths.pos", "first": "Cash", "last": "Supervisor", "role": "URY Manager", "pin": "6666", "role_id": "supervisor"},
	{"email": "callcenter@ths.pos", "first": "Call", "last": "Center", "role": "URY Cashier", "pin": "7777", "role_id": "callcenter"},
	{"email": "kitchen@ths.pos", "first": "Kitchen", "last": "Lead", "role": "URY Captain", "pin": "4444", "role_id": "kitchen"},
	{"email": "delivery@ths.pos", "first": "Delivery", "last": "Rider", "role": "URY Cashier", "pin": "5555", "role_id": "delivery"},
	{"email": "manager@ths.pos", "first": "Manager", "last": "Admin", "role": "URY Manager", "pin": "3333", "role_id": "manager"},
]


def after_migrate():
	try:
		import_master_data(force=False)
	except Exception:
		frappe.log_error(title="ths_pos after_migrate import")


@frappe.whitelist()
def import_master_data(force=0):
	"""Create/update demo master data used by THS React POS."""
	force = cint(force)
	company = _ensure_company()
	_ensure_roles()
	_ensure_item_group()
	_ensure_uom()
	price_lists = _ensure_price_lists()
	warehouses = _ensure_warehouses(company)
	_ensure_modes_of_payment()
	items = _ensure_menu_items(company, price_lists)
	branches = _ensure_branches(company)
	branch = branches[0]["name"] if branches else _ensure_branch()
	restaurant = _ensure_restaurant(company, branch)
	_ensure_tables(restaurant)
	_ensure_staff()
	_ensure_pos_profile(company, restaurant, price_lists["Dine in"])
	_seed_opening_stock(company, warehouses["Store 1"], items)
	_seed_kitchen_and_settings()
	_seed_sample_recipes(items)
	_cache_demo_master(branches)
	frappe.db.commit()
	return {
		"company": company,
		"branch": branch,
		"branches": [b["name"] for b in branches],
		"restaurant": restaurant,
		"items": len(items),
		"tables": len(DEMO_TABLES),
		"staff": len(DEMO_STAFF),
		"pins": {s["role_id"]: s["pin"] for s in DEMO_STAFF},
		"warehouses": list(warehouses.keys()),
		"imported_at": str(now_datetime()),
		"force": force,
	}


def _cache_demo_master(branches):
	"""Shared cache so React bootstrap can restore PIN / branch / floor without localStorage."""
	frappe.cache().set_value("ths_pos:tables", DEMO_TABLES)
	frappe.cache().set_value("ths_pos:branches", [
		{
			"id": b["id"],
			"name": b["name"],
			"code": b["code"],
			"city": b.get("city") or "",
			"address": b.get("address") or "",
			"erp_branch": next((x["name"] for x in branches if x["id"] == b["id"]), b["name"]),
		}
		for b in DEMO_BRANCHES
	])
	staff_rows = []
	pin_by_role = {}
	for s in DEMO_STAFF:
		pin_by_role[s["role_id"]] = s["pin"]
		staff_rows.append(
			{
				"id": s["email"],
				"name": f"{s['first']} {s['last']}",
				"email": s["email"],
				"roleId": s["role_id"],
				"pin": s["pin"],
				"active": True,
			}
		)
		frappe.cache().hset("ths_pos:pins", s["email"], s["pin"])
		frappe.cache().hset("ths_pos:pins", s["role_id"], s["pin"])
	frappe.cache().set_value("ths_pos:staff", staff_rows)
	frappe.cache().set_value("ths_pos:pin_overrides", pin_by_role)


def _seed_kitchen_and_settings():
	"""Cache kitchen sections / printers / POS settings for React admin panels."""
	frappe.cache().set_value(
		"ths_pos:kitchen",
		{
			"sections": [
				{"id": "hot", "name": "Hot line", "printer": "Kitchen-Hot"},
				{"id": "cold", "name": "Cold / garde manger", "printer": "Kitchen-Cold"},
				{"id": "bar", "name": "Bar", "printer": "Bar-1"},
			],
			"combos": [
				{
					"id": "THS-COMBO-LUNCH",
					"name": "Lunch Combo",
					"items": ["THS-POS-SOUP", "THS-POS-PAST"],
					"price": 26.0,
				}
			],
		},
	)
	frappe.cache().set_value(
		"ths_pos:settings",
		{
			"tax_percent": 0,
			"sla_minutes": 15,
			"receipt_footer": "Thank you — Neighborhood Bistro",
			"stock_deduct_on": "payment",
		},
	)


def _seed_sample_recipes(item_codes):
	"""Attach a simple BOM to first menu item when BOM DocType exists."""
	if not item_codes or not frappe.db.exists("DocType", "BOM"):
		return
	target = item_codes[0]
	if frappe.db.exists("BOM", {"item": target, "is_active": 1, "docstatus": 1}):
		return
	ings = []
	for code in ("THS-ING-TOMATO", "THS-ING-FLOUR", "THS-ING-CHEESE"):
		if frappe.db.exists("Item", code):
			ings.append({"item_code": code, "qty": 1})
	if not ings:
		return
	try:
		bom = frappe.get_doc(
			{
				"doctype": "BOM",
				"item": target,
				"quantity": 1,
				"is_active": 1,
				"is_default": 1,
				"items": ings,
			}
		)
		bom.insert(ignore_permissions=True)
		bom.submit()
	except Exception:
		frappe.log_error(title="ths_pos sample BOM")


def _ensure_company():
	existing = frappe.db.get_single_value("Global Defaults", "default_company")
	if existing:
		return existing
	name = frappe.db.get_value("Company", {}, "name")
	if name:
		return name
	# Minimal company if site is empty
	doc = frappe.get_doc(
		{
			"doctype": "Company",
			"company_name": "THS Restaurant",
			"abbr": "THS",
			"default_currency": "USD",
			"country": "United States",
		}
	)
	doc.insert(ignore_permissions=True)
	return doc.name


def _ensure_roles():
	for role in ("URY Captain", "URY Cashier", "URY Manager"):
		if not frappe.db.exists("Role", role):
			frappe.get_doc({"doctype": "Role", "role_name": role, "desk_access": 1}).insert(
				ignore_permissions=True
			)


def _ensure_item_group():
	if not frappe.db.exists("Item Group", "All Item Groups"):
		return
	if not frappe.db.exists("Item Group", "Food"):
		frappe.get_doc(
			{
				"doctype": "Item Group",
				"item_group_name": "Food",
				"parent_item_group": "All Item Groups",
				"is_group": 0,
			}
		).insert(ignore_permissions=True)


def _ensure_uom():
	if not frappe.db.exists("UOM", "Nos"):
		frappe.get_doc({"doctype": "UOM", "uom_name": "Nos"}).insert(ignore_permissions=True)


def _ensure_price_lists():
	out = {}
	for label in ("Dine in", "Takeaway", "Delivery", "Standard Selling"):
		name = label
		if not frappe.db.exists("Price List", name):
			frappe.get_doc(
				{
					"doctype": "Price List",
					"price_list_name": name,
					"selling": 1,
					"currency": frappe.db.get_value("Company", _ensure_company(), "default_currency")
					or "USD",
					"enabled": 1,
				}
			).insert(ignore_permissions=True)
		out[label] = name
	return out


def _ensure_warehouses(company):
	out = {}
	for label in ("Store 1", "Store 2"):
		wh_name = f"{label} - {frappe.get_cached_value('Company', company, 'abbr')}"
		if not frappe.db.exists("Warehouse", wh_name):
			# Try create under All Warehouses
			parent = frappe.db.get_value("Warehouse", {"company": company, "is_group": 1}, "name")
			doc = frappe.get_doc(
				{
					"doctype": "Warehouse",
					"warehouse_name": label,
					"company": company,
					"parent_warehouse": parent,
					"is_group": 0,
				}
			)
			doc.insert(ignore_permissions=True)
			wh_name = doc.name
		out[label] = wh_name
	return out


def _ensure_modes_of_payment():
	for mop in ("Cash", "Card", "UPI"):
		if not frappe.db.exists("Mode of Payment", mop):
			frappe.get_doc(
				{"doctype": "Mode of Payment", "mode_of_payment": mop, "type": "Cash" if mop == "Cash" else "Bank", "enabled": 1}
			).insert(ignore_permissions=True)


def _ensure_menu_items(company, price_lists):
	created = []
	for row in DEMO_MENU:
		if not frappe.db.exists("Item", row["code"]):
			item = frappe.get_doc(
				{
					"doctype": "Item",
					"item_code": row["code"],
					"item_name": row["name"],
					"item_group": "Food" if frappe.db.exists("Item Group", "Food") else "All Item Groups",
					"stock_uom": "Nos",
					"is_stock_item": 1,
					"is_sales_item": 1,
					"include_item_in_manufacturing": 0,
					"description": row["category"],
				}
			)
			item.insert(ignore_permissions=True)
		else:
			frappe.db.set_value("Item", row["code"], "is_stock_item", 1)
		# prices
		for pl_key, amount in (
			("Dine in", row["dine"]),
			("Takeaway", row["take"]),
			("Delivery", row["deliv"]),
		):
			pl = price_lists[pl_key]
			exists = frappe.db.exists(
				"Item Price", {"item_code": row["code"], "price_list": pl, "selling": 1}
			)
			if exists:
				frappe.db.set_value("Item Price", exists, "price_list_rate", amount)
			else:
				frappe.get_doc(
					{
						"doctype": "Item Price",
						"item_code": row["code"],
						"price_list": pl,
						"selling": 1,
						"price_list_rate": amount,
					}
				).insert(ignore_permissions=True)
		created.append(row["code"])
	return created


def _ensure_branches(company=None):
	"""Create all React demo branches on HR Branch DocType."""
	out = []
	if not frappe.db.exists("DocType", "Branch"):
		frappe.cache().set_value("ths_pos:branches", DEMO_BRANCHES)
		return [{"id": b["id"], "name": b["name"]} for b in DEMO_BRANCHES]

	meta = frappe.get_meta("Branch")
	for b in DEMO_BRANCHES:
		name = b["name"]
		if frappe.db.exists("Branch", name):
			out.append({"id": b["id"], "name": name})
			continue
		existing = frappe.db.get_value("Branch", {"branch": name}, "name") if meta.has_field("branch") else None
		if existing:
			out.append({"id": b["id"], "name": existing})
			continue
		doc = frappe.new_doc("Branch")
		doc.branch = name
		if meta.has_field("company") and company:
			doc.company = company
		# URY: `user` is a child table (URY User), not a Link
		if meta.has_field("user") and meta.get_field("user").fieldtype == "Table":
			doc.append("user", {"user": "Administrator"})
			for s in DEMO_STAFF:
				doc.append("user", {"user": s["email"]})
		try:
			doc.insert(ignore_permissions=True)
			out.append({"id": b["id"], "name": doc.name})
		except Exception:
			frappe.log_error(title=f"ths_pos branch {name}")
			fb = frappe.db.get_value("Branch", {}, "name")
			if fb:
				out.append({"id": b["id"], "name": fb})
	return out


def _ensure_branch():
	rows = _ensure_branches()
	return rows[0]["name"] if rows else None


def _ensure_restaurant(company, branch):
	# URY Restaurant doctype name variations
	dt = None
	for candidate in ("URY Restaurant", "URY Menu", "Restaurant"):
		if frappe.db.exists("DocType", candidate):
			dt = candidate
			break
	if not dt:
		return None

	# Prefer existing
	existing = frappe.db.get_value(dt, {"company": company}, "name") if frappe.get_meta(dt).has_field("company") else frappe.db.get_value(dt, {}, "name")
	if existing:
		return existing

	doc = frappe.new_doc(dt)
	if doc.meta.has_field("restaurant_name"):
		doc.restaurant_name = "Neighborhood Bistro"
	elif doc.meta.has_field("name1"):
		doc.name1 = "Neighborhood Bistro"
	if doc.meta.has_field("company"):
		doc.company = company
	if branch and doc.meta.has_field("branch"):
		doc.branch = branch
	doc.insert(ignore_permissions=True)
	return doc.name


def _ensure_tables(restaurant):
	# Always keep demo tables in cache for React POS fallback
	frappe.cache().set_value("ths_pos:tables", DEMO_TABLES)

	table_dt = None
	for candidate in ("URY Table", "Restaurant Table", "URY Restaurant Table"):
		if frappe.db.exists("DocType", candidate):
			table_dt = candidate
			break
	if not table_dt:
		return

	meta = frappe.get_meta(table_dt)
	room = None
	if meta.has_field("restaurant_room"):
		for room_dt in ("URY Restaurant Room", "Restaurant Room", "URY Room"):
			if frappe.db.exists("DocType", room_dt):
				room = frappe.db.get_value(room_dt, {}, "name")
				break

	for t in DEMO_TABLES:
		try:
			filters = {}
			if meta.has_field("table_name"):
				filters["table_name"] = t["name"]
			elif meta.has_field("table_no"):
				filters["table_no"] = t["name"]
			else:
				filters["name"] = t["name"]
			if frappe.db.exists(table_dt, filters):
				continue
			doc = frappe.new_doc(table_dt)
			if meta.has_field("table_name"):
				doc.table_name = t["name"]
			if meta.has_field("table_no"):
				doc.table_no = t["name"]
			if meta.has_field("seats"):
				doc.seats = t["seats"]
			if meta.has_field("no_of_seats"):
				doc.no_of_seats = t["seats"]
			if meta.has_field("restaurant") and restaurant:
				doc.restaurant = restaurant
			if meta.has_field("restaurant_room") and room:
				doc.restaurant_room = room
			if meta.has_field("shape"):
				doc.shape = t["shape"]
			doc.insert(ignore_permissions=True)
		except Exception:
			frappe.log_error(title=f"ths_pos table {t['name']}")


def _ensure_staff():
	for s in DEMO_STAFF:
		password = f"Pin{s['pin']}!"
		if not frappe.db.exists("User", s["email"]):
			user = frappe.get_doc(
				{
					"doctype": "User",
					"email": s["email"],
					"first_name": s["first"],
					"last_name": s["last"],
					"send_welcome_email": 0,
					"user_type": "System User",
				}
			)
			user.append("roles", {"role": s["role"]})
			user.insert(ignore_permissions=True)
			user.new_password = password
			user.save(ignore_permissions=True)
		else:
			user = frappe.get_doc("User", s["email"])
			roles = {r.role for r in user.roles}
			if s["role"] not in roles:
				user.add_roles(s["role"])
			# Keep demo PIN password in sync for testing
			try:
				from frappe.utils.password import update_password

				update_password(s["email"], password)
			except Exception:
				frappe.log_error(title=f"ths_pos password {s['email']}")
		frappe.cache().hset("ths_pos:pins", s["email"], s["pin"])
		frappe.cache().hset("ths_pos:pins", s["role_id"], s["pin"])


def _ensure_pos_profile(company, restaurant, price_list):
	name = "THS POS"
	# Prefer existing company profile used by site (e.g. Techhack Software)
	existing = frappe.db.get_value("POS Profile", {"company": company, "disabled": 0}, "name")
	target = name if frappe.db.exists("POS Profile", name) else existing
	if target:
		# Ensure KOT naming series on live profile
		if frappe.get_meta("POS Profile").has_field("custom_kot_naming_series"):
			cur = frappe.db.get_value("POS Profile", target, "custom_kot_naming_series")
			if not cur:
				frappe.db.set_value("POS Profile", target, "custom_kot_naming_series", "KOT-URY-")
		return target

	doc = frappe.new_doc("POS Profile")
	doc.name = name
	doc.company = company
	if doc.meta.has_field("restaurant"):
		doc.restaurant = restaurant
	if doc.meta.has_field("custom_kot_naming_series"):
		doc.custom_kot_naming_series = "KOT-URY-"
	doc.warehouse = frappe.db.get_value("Warehouse", {"company": company, "is_group": 0}, "name")
	doc.selling_price_list = price_list
	# payments
	if frappe.db.exists("Mode of Payment", "Cash"):
		doc.append("payments", {"mode_of_payment": "Cash", "default": 1})
	if frappe.db.exists("Mode of Payment", "Card"):
		doc.append("payments", {"mode_of_payment": "Card", "default": 0})
	try:
		doc.insert(ignore_permissions=True)
	except Exception:
		frappe.log_error(title="ths_pos POS Profile create")
		return existing
	return doc.name


def _seed_opening_stock(company, warehouse, item_codes):
	# Prefer POS Profile / Finished Goods warehouse used by URY stock checks
	fg = frappe.db.get_value("Warehouse", {"warehouse_name": ["like", "Finished Goods%"], "company": company}, "name")
	target = fg or warehouse
	ingredients = [
		("THS-ING-TOMATO", "Tomato", 50),
		("THS-ING-FLOUR", "Flour", 40),
		("THS-ING-CHEESE", "Cheese", 30),
	]
	receipt_items = []
	for code, name, qty in ingredients:
		if not frappe.db.exists("Item", code):
			frappe.get_doc(
				{
					"doctype": "Item",
					"item_code": code,
					"item_name": name,
					"item_group": "Raw Material" if frappe.db.exists("Item Group", "Raw Material") else "All Item Groups",
					"stock_uom": "Nos",
					"is_stock_item": 1,
					"include_item_in_manufacturing": 1,
				}
			).insert(ignore_permissions=True)
		bal = flt(frappe.db.get_value("Bin", {"item_code": code, "warehouse": target}, "actual_qty"))
		if bal <= 0:
			receipt_items.append({"item_code": code, "qty": qty, "t_warehouse": target, "basic_rate": 1})

	for code in item_codes or []:
		bal = flt(frappe.db.get_value("Bin", {"item_code": code, "warehouse": target}, "actual_qty"))
		need = 1000 - bal
		if need > 0:
			receipt_items.append({"item_code": code, "qty": need, "t_warehouse": target, "basic_rate": 1})

	if not receipt_items:
		return
	try:
		se = frappe.get_doc(
			{
				"doctype": "Stock Entry",
				"stock_entry_type": "Material Receipt",
				"company": company,
				"items": receipt_items,
			}
		)
		se.insert(ignore_permissions=True)
		se.submit()
	except Exception:
		frappe.log_error(title="ths_pos stock seed")
