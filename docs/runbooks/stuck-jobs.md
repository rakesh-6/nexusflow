# Stuck background jobs

Reminders, notification emails, clean-ups, automations and the demo reset run
in the background with pg-boss, inside the same Render service.

1. **Is the service awake?** On the free plan it sleeps after 15 minutes without
   visitors, and jobs pause. Open the site; jobs start again within a minute, and
   every scheduled job runs once on start-up to catch up.
2. **Is it switched on?** Render → Environment: `JOBS_ENABLED` must be `true`.
3. **Read the logs**: Render → Logs, search for `Job failed` or `Background jobs`.
   `Background jobs could not start` usually means the database URL is wrong.
4. **Look at the queue** (Neon SQL editor, read-only query):

   ```sql
   select name, state, count(*) from pgboss.job group by 1, 2 order by 1, 2;
   ```

   Many `failed` rows for one name point at that job's code; the `output` column
   holds the error.

5. **Emails only?** Brevo's free plan sends 300 a day; after that, emails are
   skipped (in-app notifications still arrive). The logs say `daily cap`.
6. A restart (Render → Manual Deploy → Restart) clears a stuck worker.
