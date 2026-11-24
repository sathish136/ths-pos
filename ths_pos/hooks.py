app_name = "ths_pos"
app_title = "THS POS"
app_publisher = "THS"
app_description = "Custom React restaurant POS for URY/ERPNext"
app_email = "college@thssolution.in"
app_license = "mit"

required_apps = ["erpnext", "ury"]

# /pos = chooser (ERP vs Custom React); /pos/app = custom SPA
website_route_rules = [
	{"from_route": "/pos/app/<path:app_path>", "to_route": "pos_app"},
	{"from_route": "/pos/app", "to_route": "pos_app"},
	{"from_route": "/pos/<path:app_path>", "to_route": "pos"},
	{"from_route": "/pos", "to_route": "pos"},
]

# Cashier / captain land on POS chooser after login
role_home_page = {
	"URY Captain": "/pos",
	"URY Cashier": "/pos",
	"URY Manager": "/pos",
}

after_migrate = ["ths_pos.api.migrate.after_migrate"]
