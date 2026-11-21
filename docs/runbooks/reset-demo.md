# Reset the demo

With `DEMO_MODE=true`, "Acme Studio" is rebuilt from the sample data every
`DEMO_RESET_HOURS` (default 24), checked at start-up and hourly. Visitor
accounts are removed with it.

To reset it now (for example before showing the project to someone):

1. In the Neon SQL editor, make the organization look old:

   ```sql
   update "Organization" set "createdAt" = now() - interval '7 days' where slug = 'acme';
   ```

2. Restart the service (Render → Manual Deploy → Restart). On start-up it sees
   the organization is due and rebuilds it (about a minute; "Try the demo"
   answers "being prepared" meanwhile).

To switch the demo off, set `DEMO_MODE=false` on Render. The organization stays
until you delete it; nobody new can join it.
