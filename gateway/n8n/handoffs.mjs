import { createHash } from 'node:crypto';

const day = 24 * 60 * 60 * 1000;

// The gateway database is opened read-only. All notification state belongs to this service.
export function handoffs(source, state, session, now = Date.now) {
  state.exec(`CREATE TABLE IF NOT EXISTS notices (
    id TEXT PRIMARY KEY, jid TEXT NOT NULL, marker TEXT NOT NULL, opened INTEGER NOT NULL,
    stage TEXT NOT NULL, retry INTEGER NOT NULL DEFAULT 0
  ); CREATE TABLE IF NOT EXISTS initialized (session TEXT PRIMARY KEY)`);
  const active = source.prepare('SELECT jid, message FROM team_handoffs WHERE session=? AND active=1');
  const current = source.prepare('SELECT message FROM team_handoffs WHERE session=? AND jid=? AND active=1');
  const insert = state.prepare('INSERT OR IGNORE INTO notices(id,jid,marker,opened,stage) VALUES(?,?,?,?,?)');
  function capture(stage) {
    for (const {jid, message} of active.all(session)) {
      const id = createHash('sha256').update(JSON.stringify([session, jid, message])).digest('hex');
      insert.run(id, jid, message, now(), stage);
    }
  }
  if (!state.prepare('SELECT 1 FROM initialized WHERE session=?').get(session)) {
    state.exec('BEGIN');
    try {
      capture('historical');
      state.prepare('INSERT INTO initialized VALUES(?)').run(session);
      state.exec('COMMIT');
    } catch (error) { state.exec('ROLLBACK'); throw error; }
  }
  function stillOpen(row) { return current.get(session, row.jid)?.message === row.marker; }
  function due() {
    capture('new');
    const rows = state.prepare(`SELECT * FROM notices WHERE retry<=? AND
      (stage='new' OR (stage='notified' AND opened<=?)) ORDER BY opened`).all(now(), now()-day);
    const result=[];
    for (const row of rows) {
      if (!stillOpen(row)) {
        state.prepare("UPDATE notices SET stage='closed' WHERE id=?").run(row.id);
      } else if (result.length<20) result.push({id:row.id});
    }
    return result;
  }
  async function deliver(id, send) {
    const row = state.prepare('SELECT * FROM notices WHERE id=?').get(id);
    if (!row || !stillOpen(row) || row.retry>now()) return 'skipped';
    const reminder = row.stage==='notified' && row.opened<=now()-day;
    if (row.stage!=='new' && !reminder) return 'skipped';
    // Never replay an ambiguous SMTP send automatically, even across a worker restart.
    state.prepare("UPDATE notices SET stage='sending' WHERE id=?").run(id);
    const contact = source.prepare('SELECT name,preview FROM service_chat WHERE session=? AND jid=?').get(session,row.jid);
    try {
      await send({id, session, jid:row.jid, name:contact?.name||'', preview:contact?.preview||'', opened:row.opened, reminder});
      state.prepare('UPDATE notices SET stage=?,retry=0 WHERE id=?').run(reminder?'reminded':'notified',id);
      return 'accepted';
    } catch (error) {
      state.prepare('UPDATE notices SET stage=?,retry=? WHERE id=?').run(error.retryable?row.stage:'uncertain',now()+300000,id);
      throw error;
    }
  }
  return {due, deliver};
}
