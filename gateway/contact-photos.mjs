export function whatsappPhoto(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port ||
        !/(^|\.)(whatsapp\.net|whatsapp\.com|fbcdn\.net)$/i.test(url.hostname)) return null;
    const expires = url.searchParams.get('oe');
    if (expires && parseInt(expires, 16) * 1000 <= Date.now()) return null;
    return url.href;
  } catch { return null; }
}

// Photo lookups are independent of the inbox. Limit concurrent requests to the paired phone.
export function contactPhotos(gateway, session) {
  const cache = new Map();
  let active = 0;
  return function photo(row) {
    const now = Date.now();
    let entry = cache.get(row.jid);
    if (!entry || entry.until <= now) {
      if (active < 4) {
        if (cache.size >= 1000) cache.delete(cache.keys().next().value);
        entry = {url:whatsappPhoto(row.profilePic), until:Infinity};
        cache.set(row.jid, entry);
        active++;
        gateway('chat/'+session+'/'+encodeURIComponent(row.jid)+'/profile-picture', {})
          .then(result => {
            entry.url = whatsappPhoto(result?.profilePicUrl);
            entry.until = Date.now() + (entry.url ? 3600000 : 600000);
          })
          .catch(() => { entry.until = Date.now() + 120000; })
          .finally(() => { active--; });
      }
    }
    return whatsappPhoto(entry ? entry.url : row.profilePic);
  };
}
