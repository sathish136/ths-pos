# URY POS backup format (`ury-pos-backup` v1)

Managers download a backup from **Admin → Backup & restore**. The file is plain JSON.

## Envelope

| Field           | Type   | Value                                              |
|-----------------|--------|----------------------------------------------------|
| `format`        | string | Always `"ury-pos-backup"`                          |
| `formatVersion` | number | `1`                                                |
| `exportedAt`    | string | ISO-8601 timestamp of the export                   |
| `data`          | object | The shared POS session (see below)                 |

## `data` (shared session blob)

The blob is the same structure the POS keeps on each device and on the shared server
(`/api/demo-session`). Keys that may be present:

| Key                | Contents                                                        |
|--------------------|-----------------------------------------------------------------|
| `ticketBook`       | Open tickets keyed by table/ticket id                            |
| `dayOrders`        | Orders placed in the current business day                        |
| `kitchenBoard`     | Kitchen queue (sent / preparing / ready)                         |
| `sales`            | Paid sales (`SaleRecord`: receipt no., totals, discount, tip, payment, customer) |
| `moves`            | Stock movements                                                  |
| `tables`           | Table layout and status                                          |
| `stock`, `stockByStore`, `activeStoreId` | Inventory per store                            |
| `recipes`          | Recipe definitions                                               |
| `shift`, `shiftHistory` | Current shift and closed shifts                              |
| `ticketSeq`        | Last issued ticket number (never goes backwards on restore)      |
| `extras`           | Admin settings: kitchen sections and printers, combos, notification rules and shared inbox, staff accounts (name, role, PIN), permission overrides per role, menu availability and per-sales-type prices, floor background and table colours, customer payments on account, statement template, PIN overrides, button labels, export columns, read-only API token |
| `settings`         | Restaurant settings (name, tax rate, SLA, etc.)                  |

Unknown keys are preserved on restore so newer exports still load on older builds.

## Restore rules

1. The file must have `format === "ury-pos-backup"` and `formatVersion === 1`; anything else is rejected.
2. Restore replaces the POS data on the device and is pushed to the shared server.
3. `ticketSeq` is kept at the higher of the backup value and the server value so ticket numbers are never reused.

## Not included

- Attachments. They live in the configured storage: the POS server's `.demo-session-data/attachments` folder, or the S3-compatible bucket when `POS_STORAGE=s3`. Bucket keys are server environment variables and are never written into the backup.
- Browser-only preferences such as the theme.
