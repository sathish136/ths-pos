import frappe
from frappe import _

no_cache = 1


def get_context(context):
	context.no_header = True
	context.no_cache = 1
	context.title = _("Custom React POS")
	if frappe.session.user == "Guest":
		frappe.local.flags.redirect_location = "/login?redirect-to=/pos/app"
		raise frappe.Redirect
