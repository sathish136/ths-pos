# THS / URY POS staff (ERP + React PIN pad)

Custom React: `/pos` → Custom React. Stock URY: `/urypos`.

Demo PIN pad uses the same PINs. ERP login password = `Pin{PIN}!`.

| Role (PIN pad) | PIN | ERP user | Password |
|---|---|---|---|
| Captain | 1111 | captain@ths.pos | Pin1111! |
| Cashier | 2222 | cashier@ths.pos | Pin2222! |
| Cashier 2 | 2223 | cashier2@ths.pos | Pin2223! |
| Manager | 3333 | manager@ths.pos | Pin3333! |
| Kitchen | 4444 | kitchen@ths.pos | Pin4444! |
| Delivery | 5555 | delivery@ths.pos | Pin5555! |
| Cash Supervisor | 6666 | supervisor@ths.pos | Pin6666! |
| Call Center | 7777 | callcenter@ths.pos | Pin7777! |

## Branches (React + ERP)

| Id | Code | Name |
|---|---|---|
| main | MAIN | URY Main Street |
| harbor | HBR | URY Harbor |
| airport | APT | URY Airport |

Re-seed:

```bash
bench --site thssolution.in console
>>> from ths_pos.api.migrate import import_master_data
>>> import_master_data(force=1)
```
