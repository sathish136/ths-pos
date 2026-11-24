# Copyright (c) 2026, THS
"""Core POS API adapters over ERPNext / URY for the React SPA."""

import frappe
from frappe import _
from frappe.utils import flt, now_datetime


@frappe.whitelist()
def bootstrap():
	"""Initial payload for React POS: user, roles, menu, tables, profile."""
	user = frappe.session.user
	if user == "Guest":
		frappe.throw(_("Login required"), frappe.PermissionError)

	roles = frappe.get_roles(user)
	company = frappe.db.get_single_value("Global Defaults", "default_company") or frappe.db.get_value(
		"Company", {}, "name"
	)
	pos_profile = frappe.db.get_value("POS Profile", {"company": company}, "name") or frappe.db.get_value(
		"POS Profile", {}, "name"
	)

	from ths_pos.api.admin import get_config, list_recipes

	config = get_config() or {}
	return {
		"user": user,
		"full_name": frappe.utils.get_fullname(user),
		"roles": roles,
		"company": company,
		"pos_profile": pos_profile,
		"menu": get_menu(pos_profile),
		"tables": get_tables(),
		"branches": get_branches(),
		"staff": get_staff(),
		"pins": get_pins(),
		"day_orders": list_day_orders(),
		"kots": list_kots(80),
		"shift": get_shift(pos_profile),
		"recipes": list_recipes(),
		"config": config,
		"now": str(now_datetime()),
	}


@frappe.whitelist()
def get_menu(pos_profile=None):
	"""Selling items with rates from Standard / Dine in price list."""
	price_list = None
	if pos_profile and frappe.db.exists("POS Profile", pos_profile):
		price_list = frappe.db.get_value("POS Profile", pos_profile, "selling_price_list")
	if not price_list:
		for candidate in ("Dine in", "Standard Selling"):
			if frappe.db.exists("Price List", candidate):
				price_list = candidate
				break

	items = frappe.get_all(
		"Item",
		filters={"disabled": 0, "is_sales_item": 1, "item_code": ["like", "THS-POS-%"]},
		fields=["name", "item_code", "item_name", "description", "image", "item_group"],
		order_by="item_name",
	)
	if not items:
		items = frappe.get_all(
			"Item",
			filters={"disabled": 0, "is_sales_item": 1},
			fields=["name", "item_code", "item_name", "description", "image", "item_group"],
			order_by="item_name",
			limit_page_length=80,
		)

	out = []
	for it in items:
		rates = {}
		for pl in ("Dine in", "Takeaway", "Delivery", price_list):
			if not pl:
				continue
			rate = frappe.db.get_value(
				"Item Price",
				{"item_code": it.item_code, "price_list": pl, "selling": 1},
				"price_list_rate",
			)
			if rate is not None:
				rates[pl] = flt(rate)
		out.append(
			{
				"id": it.item_code,
				"code": it.item_code,
				"name": it.item_name,
				"category": it.description or it.item_group,
				"image": it.image,
				"price": rates.get("Dine in") or rates.get(price_list) or 0,
				"prices": {
					"Dine in": rates.get("Dine in") or rates.get(price_list) or 0,
					"Takeaway": rates.get("Takeaway") or rates.get("Dine in") or 0,
					"Delivery": rates.get("Delivery") or rates.get("Dine in") or 0,
				},
				"available": True,
			}
		)
	return out


def _ensure_demo_cache():
	"""Rebuild PIN/branch/floor cache after clear-cache (demo constants)."""
	if frappe.cache().get_value("ths_pos:pin_overrides") and frappe.cache().get_value("ths_pos:tables"):
		return
	try:
		from ths_pos.api.migrate import DEMO_BRANCHES, DEMO_STAFF, DEMO_TABLES, _cache_demo_master

		branches = [{"id": b["id"], "name": b["name"]} for b in DEMO_BRANCHES]
		_cache_demo_master(branches)
	except Exception:
		frappe.log_error(title="ths_pos restore demo cache")


@frappe.whitelist()
def get_tables():
	_ensure_demo_cache()
	# Prefer React demo floor (ids/zones/layout) so ERP POS matches tested UI
	cached = frappe.cache().get_value("ths_pos:tables")
	if cached:
		# de-dupe by id
		seen = set()
		out = []
		for t in cached:
			tid = t.get("id") or t["name"]
			if tid in seen:
				continue
			seen.add(tid)
			out.append(
				{
					"id": tid,
					"name": t["name"],
					"seats": t.get("seats", 2),
					"zone": t.get("zone"),
					"shape": t.get("shape"),
					"x": t.get("x"),
					"y": t.get("y"),
					"occupied": False,
				}
			)
		return out

	for dt in ("URY Table", "Restaurant Table", "URY Restaurant Table"):
		if not frappe.db.exists("DocType", dt):
			continue
		meta = frappe.get_meta(dt)
		fields = ["name"]
		for f in ("table_name", "table_no", "seats", "no_of_seats", "restaurant", "occupied"):
			if meta.has_field(f):
				fields.append(f)
		rows = frappe.get_all(dt, fields=fields, limit_page_length=200)
		out = []
		for r in rows:
			label = r.get("table_name") or r.get("table_no") or r.name
			out.append(
				{
					"id": r.name,
					"name": label,
					"seats": r.get("seats") or r.get("no_of_seats") or 2,
					"restaurant": r.get("restaurant"),
					"occupied": cint_bool(r.get("occupied")),
				}
			)
		if out:
			return out
	return []


def cint_bool(v):
	return 1 if v else 0


@frappe.whitelist()
def get_branches():
	_ensure_demo_cache()
	cached = frappe.cache().get_value("ths_pos:branches")
	if cached:
		return cached
	# Fallback to React demo names even if DocType empty
	return [
		{"id": "main", "name": "URY Main Street", "code": "MAIN", "city": "Downtown", "address": "12 Main Street"},
		{"id": "harbor", "name": "URY Harbor", "code": "HBR", "city": "Waterfront", "address": "4 Pier Lane"},
		{"id": "airport", "name": "URY Airport", "code": "APT", "city": "Terminal B", "address": "Gate plaza · T2"},
	]


@frappe.whitelist()
def get_staff():
	_ensure_demo_cache()
	pins = get_pins()
	cached = frappe.cache().get_value("ths_pos:staff")
	if cached:
		# ensure pins filled after clear-cache
		fixed = []
		for s in cached:
			role = s.get("roleId") or ""
			pin = s.get("pin") or pins.get(role) or frappe.cache().hget("ths_pos:pins", s.get("email") or "") or ""
			fixed.append({**s, "pin": pin})
		return fixed
	# Build from *@ths.pos users
	users = frappe.get_all(
		"User",
		filters={"email": ["like", "%@ths.pos"], "enabled": 1},
		fields=["name", "email", "full_name", "first_name", "last_name"],
	)
	out = []
	for u in users:
		role_id = (u.email.split("@")[0] if u.email else "")
		pin = pins.get(role_id) or frappe.cache().hget("ths_pos:pins", u.email) or ""
		out.append(
			{
				"id": u.email,
				"name": u.full_name or f"{u.first_name or ''} {u.last_name or ''}".strip(),
				"email": u.email,
				"roleId": role_id,
				"pin": pin,
				"active": True,
			}
		)
	return out


@frappe.whitelist()
def get_pins():
	_ensure_demo_cache()
	cached = frappe.cache().get_value("ths_pos:pin_overrides")
	if cached:
		return cached
	return {
		"captain": "1111",
		"cashier": "2222",
		"cashier2": "2223",
		"supervisor": "6666",
		"callcenter": "7777",
		"kitchen": "4444",
		"delivery": "5555",
		"manager": "3333",
	}


@frappe.whitelist()
def sync_order(payload=None):
	"""Create/update draft POS Invoice from React ticket payload."""
	if payload is None:
		payload = frappe.request.get_json(silent=True) or frappe.form_dict
	if isinstance(payload, str):
		import json

		payload = json.loads(payload)

	company = payload.get("company") or frappe.db.get_single_value("Global Defaults", "default_company")
	pos_profile = payload.get("pos_profile") or frappe.db.get_value("POS Profile", {"company": company}, "name")
	customer = payload.get("customer") or _default_customer(company)
	items = payload.get("items") or []
	invoice_name = payload.get("invoice")

	if invoice_name and frappe.db.exists("POS Invoice", invoice_name):
		doc = frappe.get_doc("POS Invoice", invoice_name)
		if doc.docstatus != 0:
			frappe.throw(_("Invoice is not editable"))
		doc.set("items", [])
	else:
		doc = frappe.new_doc("POS Invoice")
		doc.company = company
		doc.customer = customer
		doc.pos_profile = pos_profile
		doc.is_pos = 1
		doc.set_posting_time = 1
		if doc.meta.has_field("update_stock"):
			doc.update_stock = 0

	if payload.get("table") and doc.meta.has_field("restaurant_table"):
		doc.restaurant_table = payload.get("table")
	if payload.get("order_type") and doc.meta.has_field("order_type"):
		doc.order_type = _map_order_type(payload.get("order_type"))
	if payload.get("no_of_pax") is not None and doc.meta.has_field("no_of_pax"):
		doc.no_of_pax = int(payload.get("no_of_pax") or 0)

	for line in items:
		doc.append(
			"items",
			{
				"item_code": line.get("code") or line.get("id") or line.get("item_code"),
				"qty": flt(line.get("qty") or 1),
				"rate": flt(line.get("price") or line.get("rate") or 0),
				"description": line.get("notes") or line.get("name"),
			},
		)

	# Draft POS Invoice still requires a payment mode row
	if not doc.get("payments"):
		mop = "Cash" if frappe.db.exists("Mode of Payment", "Cash") else None
		if not mop and pos_profile:
			mop = frappe.db.get_value("POS Profile Payment", {"parent": pos_profile}, "mode_of_payment")
		if mop:
			doc.append("payments", {"mode_of_payment": mop, "amount": 0})

	_ensure_pos_opening(company, pos_profile)
	doc.flags.ignore_permissions = True
	doc.save()
	return {"invoice": doc.name, "grand_total": doc.grand_total, "status": "Draft"}


def _ensure_pos_opening(company, pos_profile):
	"""Create a POS Opening Entry if none is open for this profile."""
	if not pos_profile:
		return
	open_entry = frappe.db.exists(
		"POS Opening Entry",
		{"pos_profile": pos_profile, "docstatus": 1, "status": "Open"},
	)
	if open_entry:
		return open_entry

	# Some versions use period_end_date is null instead of status
	open_entry = frappe.db.sql(
		"""
		SELECT name FROM `tabPOS Opening Entry`
		WHERE pos_profile=%s AND docstatus=1
		AND IFNULL(status,'Open')='Open'
		ORDER BY creation DESC LIMIT 1
		""",
		(pos_profile,),
	)
	if open_entry:
		return open_entry[0][0]

	doc = frappe.new_doc("POS Opening Entry")
	doc.company = company
	doc.pos_profile = pos_profile
	doc.period_start_date = frappe.utils.now()
	doc.user = frappe.session.user
	# balance details from profile payments
	profile = frappe.get_doc("POS Profile", pos_profile)
	for p in profile.get("payments") or []:
		doc.append(
			"balance_details",
			{"mode_of_payment": p.mode_of_payment, "opening_amount": 0},
		)
	if not doc.balance_details and frappe.db.exists("Mode of Payment", "Cash"):
		doc.append("balance_details", {"mode_of_payment": "Cash", "opening_amount": 0})
	doc.flags.ignore_permissions = True
	doc.insert()
	doc.submit()
	return doc.name


@frappe.whitelist()
def pay_order(invoice, payments=None):
	"""Submit POS Invoice with payments."""
	import json

	doc = frappe.get_doc("POS Invoice", invoice)
	if doc.docstatus != 0:
		frappe.throw(_("Invoice already submitted"))
	if isinstance(payments, str):
		payments = json.loads(payments)
	payments = payments or [{"mode_of_payment": "Cash", "amount": doc.grand_total}]
	doc.set("payments", [])
	for p in payments:
		doc.append(
			"payments",
			{
				"mode_of_payment": p.get("mode_of_payment") or p.get("method") or "Cash",
				"amount": flt(p.get("amount") or 0),
			},
		)
	doc.paid_amount = sum(flt(p.get("amount") or 0) for p in payments)
	doc.flags.ignore_permissions = True
	doc.save()
	doc.submit()
	return {"invoice": doc.name, "status": "Paid", "grand_total": doc.grand_total}


@frappe.whitelist()
def list_day_orders(date=None):
	"""POS invoices for today — shaped for React Orders panel."""
	filters = {"docstatus": ["<", 2], "posting_date": date or frappe.utils.today()}
	meta = frappe.get_meta("POS Invoice")
	fields = ["name", "customer", "grand_total", "status", "docstatus", "posting_time", "creation", "owner"]
	for optional in ("restaurant_table", "order_type", "no_of_pax", "posting_date"):
		if meta.has_field(optional):
			fields.append(optional)
	rows = frappe.get_all(
		"POS Invoice",
		filters=filters,
		fields=fields,
		order_by="creation desc",
		limit_page_length=200,
	)
	out = []
	for r in rows:
		items = frappe.get_all(
			"POS Invoice Item",
			filters={"parent": r.name},
			fields=["item_code", "item_name", "qty", "rate", "amount"],
		)
		paid = r.docstatus == 1
		opened_ms = 0
		if r.creation:
			try:
				opened_ms = frappe.utils.get_datetime(r.creation).timestamp() * 1000
			except Exception:
				opened_ms = 0
		out.append(
			{
				"id": r.name,
				"invoice": r.name,
				"number": r.name,
				"customer": r.customer,
				"table": r.get("restaurant_table"),
				"type": r.get("order_type") or "Dine In",
				"partySize": r.get("no_of_pax") or 0,
				"grand_total": r.grand_total,
				"status": "Paid" if paid else ("Draft" if r.docstatus == 0 else (r.status or "Draft")),
				"docstatus": r.docstatus,
				"posting_time": str(r.posting_time or ""),
				"openedAtMs": opened_ms,
				"by": r.owner,
				"items": [
					{
						"code": i.item_code,
						"name": i.item_name,
						"qty": i.qty,
						"price": i.rate,
						"amount": i.amount,
					}
					for i in items
				],
			}
		)
	return out


@frappe.whitelist()
def void_order(invoice):
	doc = frappe.get_doc("POS Invoice", invoice)
	if doc.docstatus == 1:
		doc.cancel()
	elif doc.docstatus == 0:
		doc.delete()
	return {"ok": True}


@frappe.whitelist()
def send_kot(payload=None):
	"""Create URY KOT from invoice + items (send to kitchen)."""
	if payload is None:
		payload = frappe.request.get_json(silent=True) or frappe.form_dict
	if isinstance(payload, str):
		import json

		payload = json.loads(payload)

	invoice = payload.get("invoice")
	items = payload.get("items") or []
	if not invoice:
		frappe.throw(_("Invoice required"))
	if not frappe.db.exists("POS Invoice", invoice):
		frappe.throw(_("Invoice not found"))
	if not frappe.db.exists("DocType", "URY KOT"):
		return {"ok": False, "reason": "URY KOT DocType missing"}

	pos_invoice = frappe.get_doc("POS Invoice", invoice)
	pos_profile = pos_invoice.pos_profile or payload.get("pos_profile")
	table = payload.get("table") or getattr(pos_invoice, "restaurant_table", None)
	comments = payload.get("comments") or ""

	series = "KOT-URY-"
	if pos_profile and frappe.get_meta("POS Profile").has_field("custom_kot_naming_series"):
		series = (
			frappe.db.get_value("POS Profile", pos_profile, "custom_kot_naming_series") or series
		)

	kot = frappe.new_doc("URY KOT")
	kot.invoice = invoice
	if kot.meta.has_field("naming_series"):
		kot.naming_series = series
	if kot.meta.has_field("date"):
		kot.date = frappe.utils.today()
	if kot.meta.has_field("time"):
		kot.time = frappe.utils.nowtime()
	if kot.meta.has_field("restaurant_table") and table:
		kot.restaurant_table = table
	if kot.meta.has_field("customer_name"):
		kot.customer_name = pos_invoice.customer
	if kot.meta.has_field("pos_profile") and pos_profile:
		kot.pos_profile = pos_profile
	if kot.meta.has_field("comments"):
		kot.comments = comments
	if kot.meta.has_field("type"):
		kot.type = "New Order"
	if kot.meta.has_field("order_status"):
		kot.order_status = "Ready For Prepare"
	if kot.meta.has_field("user"):
		kot.user = frappe.session.user
	if kot.meta.has_field("branch") and getattr(pos_invoice, "branch", None):
		kot.branch = pos_invoice.branch

	for line in items:
		code = line.get("code") or line.get("item_code") or line.get("id") or line.get("item")
		if not code:
			continue
		name = line.get("name") or line.get("item_name") or code
		qty = flt(line.get("qty") or line.get("quantity") or 1)
		note = line.get("notes") or line.get("comments") or ""
		kot.append(
			"kot_items",
			{
				"item": code,
				"item_name": name,
				"quantity": qty,
				"comments": note,
			},
		)

	if not kot.get("kot_items"):
		frappe.throw(_("No KOT items"))

	kot.flags.ignore_permissions = True
	kot.insert()
	try:
		kot.submit()
	except Exception:
		# Some sites leave KOT as draft until kitchen accepts
		frappe.log_error(title="ths_pos send_kot submit")
	return {"kot": kot.name, "invoice": invoice, "status": kot.get("order_status") or "Ready For Prepare"}


@frappe.whitelist()
def update_kot_status(kot, status):
	"""Map React kitchen actions to URY KOT.order_status."""
	if not frappe.db.exists("URY KOT", kot):
		frappe.throw(_("KOT not found"))
	# React: preparing / ready / served / cancelled → URY live statuses
	mapping = {
		"preparing": "Ready For Prepare",
		"ready": "Ready For Prepare",
		"served": "Served",
		"Served": "Served",
		"Ready For Prepare": "Ready For Prepare",
		"cancelled": "Ready For Prepare",
	}
	target = mapping.get(status, status)
	doc = frappe.get_doc("URY KOT", kot)
	if doc.meta.has_field("order_status"):
		# order_status is often read_only — set via db
		frappe.db.set_value("URY KOT", kot, "order_status", target)
	if status in ("cancelled", "Cancelled") and doc.meta.has_field("type"):
		frappe.db.set_value("URY KOT", kot, "type", "Cancelled")
	frappe.db.commit()
	return {"kot": kot, "status": target}


@frappe.whitelist()
def list_kots(limit=50):
	if not frappe.db.exists("DocType", "URY KOT"):
		return []
	return frappe.get_all(
		"URY KOT",
		fields=["name", "invoice", "restaurant_table", "order_status", "type", "creation", "pos_profile"],
		order_by="creation desc",
		limit_page_length=int(limit or 50),
	)


@frappe.whitelist()
def get_shift(pos_profile=None):
	"""Return open POS Opening Entry for profile (if any)."""
	company = frappe.db.get_single_value("Global Defaults", "default_company")
	pos_profile = pos_profile or frappe.db.get_value("POS Profile", {"company": company}, "name")
	if not pos_profile:
		return None
	name = frappe.db.get_value(
		"POS Opening Entry",
		{"pos_profile": pos_profile, "docstatus": 1, "status": "Open"},
		"name",
	)
	if not name:
		return None
	doc = frappe.get_doc("POS Opening Entry", name)
	float_amt = 0
	for row in doc.get("balance_details") or []:
		float_amt += flt(row.opening_amount)
	return {
		"id": doc.name,
		"pos_profile": pos_profile,
		"opened_at": str(doc.period_start_date),
		"opened_by": doc.user,
		"openingFloat": float_amt,
		"status": "open",
	}


@frappe.whitelist()
def open_shift(pos_profile=None, opening_float=0):
	"""Open POS Opening Entry (idempotent if already open)."""
	company = frappe.db.get_single_value("Global Defaults", "default_company")
	pos_profile = pos_profile or frappe.db.get_value("POS Profile", {"company": company}, "name")
	existing = get_shift(pos_profile)
	if existing:
		return existing

	doc = frappe.new_doc("POS Opening Entry")
	doc.company = company
	doc.pos_profile = pos_profile
	doc.period_start_date = frappe.utils.now()
	doc.user = frappe.session.user
	profile = frappe.get_doc("POS Profile", pos_profile)
	cash_set = False
	for p in profile.get("payments") or []:
		amt = flt(opening_float) if (p.mode_of_payment == "Cash" and not cash_set) else 0
		if p.mode_of_payment == "Cash":
			cash_set = True
		doc.append("balance_details", {"mode_of_payment": p.mode_of_payment, "opening_amount": amt})
	if not doc.balance_details and frappe.db.exists("Mode of Payment", "Cash"):
		doc.append("balance_details", {"mode_of_payment": "Cash", "opening_amount": flt(opening_float)})
	doc.flags.ignore_permissions = True
	doc.insert()
	doc.submit()
	return get_shift(pos_profile)


@frappe.whitelist()
def close_shift(pos_profile=None, declared_cash=None):
	"""Create POS Closing Entry from open opening entry."""
	from erpnext.accounts.doctype.pos_closing_entry.pos_closing_entry import (
		make_closing_entry_from_opening,
	)

	company = frappe.db.get_single_value("Global Defaults", "default_company")
	pos_profile = pos_profile or frappe.db.get_value("POS Profile", {"company": company}, "name")
	opening_name = frappe.db.get_value(
		"POS Opening Entry",
		{"pos_profile": pos_profile, "docstatus": 1, "status": "Open"},
		"name",
	)
	if not opening_name:
		frappe.throw(_("No open shift"))

	opening = frappe.get_doc("POS Opening Entry", opening_name)
	closing = make_closing_entry_from_opening(opening)
	# Apply declared cash on Cash mop row when provided
	if declared_cash is not None:
		for row in closing.get("payment_reconciliation") or []:
			if row.mode_of_payment == "Cash":
				row.closing_amount = flt(declared_cash)
				break
	closing.flags.ignore_permissions = True
	closing.insert()
	closing.submit()
	return {
		"closing": closing.name,
		"opening": opening_name,
		"grand_total": closing.grand_total,
		"status": "closed",
	}


def _map_order_type(value):
	"""Map React demo labels to URY POS Invoice select options."""
	raw = (value or "").strip()
	mapping = {
		"Dine in": "Dine In",
		"Dine In": "Dine In",
		"Takeaway": "Take Away",
		"Take Away": "Take Away",
		"Delivery": "Delivery",
		"Phone In": "Phone In",
		"Aggregators": "Aggregators",
	}
	return mapping.get(raw, "Dine In")


def _default_customer(company):
	name = frappe.db.get_value("Customer", {"customer_name": "Walk-in Customer"}, "name")
	if name:
		return name
	name = frappe.db.get_value("Customer", {}, "name")
	if name:
		return name
	doc = frappe.get_doc(
		{
			"doctype": "Customer",
			"customer_name": "Walk-in Customer",
			"customer_type": "Individual",
			"customer_group": frappe.db.get_value("Customer Group", {"is_group": 0}, "name") or "All Customer Groups",
			"territory": frappe.db.get_value("Territory", {"is_group": 0}, "name") or "All Territories",
		}
	)
	doc.insert(ignore_permissions=True)
	return doc.name
