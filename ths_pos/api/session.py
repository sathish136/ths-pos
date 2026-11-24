# Copyright (c) 2026, THS
"""Shared POS session store (bridge until full DocType wiring)."""

import json

import frappe
from frappe.utils.caching import redis_cache


CACHE_KEY = "ths_pos:shared_session"
SEQ_KEY = "ths_pos:ticket_seq"


def _get_cache():
	return frappe.cache()


@frappe.whitelist()
def get_session():
	raw = _get_cache().get_value(CACHE_KEY)
	if not raw:
		return {}
	if isinstance(raw, dict):
		return raw
	try:
		return json.loads(raw)
	except Exception:
		return {}


@frappe.whitelist()
def save_session(blob=None):
	if blob is None:
		blob = frappe.form_dict.get("blob") or frappe.request.get_json(silent=True) or {}
	if isinstance(blob, str):
		blob = json.loads(blob)
	if not isinstance(blob, dict):
		frappe.throw("Invalid session blob")

	existing = get_session()
	incoming_rev = int(blob.get("rev") or 0)
	existing_rev = int(existing.get("rev") or 0)
	if incoming_rev < existing_rev:
		return existing

	# Shallow merge shared keys; prefer incoming for higher rev
	merged = dict(existing)
	merged.update(blob)
	_get_cache().set_value(CACHE_KEY, json.dumps(merged))
	return merged


@frappe.whitelist()
def reserve_ticket(floor=0):
	floor = int(floor or 0)
	cache = _get_cache()
	current = int(cache.get_value(SEQ_KEY) or 0)
	session = get_session()
	session_max = int(session.get("ticketSeq") or 0)
	nxt = max(current, session_max, floor) + 1
	cache.set_value(SEQ_KEY, nxt)
	session["ticketSeq"] = nxt
	cache.set_value(CACHE_KEY, json.dumps(session))
	return {"number": nxt}
