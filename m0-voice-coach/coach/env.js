// Case-insensitive env lookup.
//
// Some hosts normalize environment variable names (e.g. force lowercase),
// which would silently break exact-case reads like process.env.FOO.
// envVal() checks the exact name first, then falls back to a
// case-insensitive match, so UPPER_CASE and lower_case both work.

function envVal(env, ...names) {
  const e = env || process.env;
  for (const name of names) {
    if (e[name] !== undefined && e[name] !== '') return e[name];
  }
  const lower = names.map((n) => n.toLowerCase());
  for (const key of Object.keys(e)) {
    if (lower.indexOf(key.toLowerCase()) !== -1 && e[key] !== undefined && e[key] !== '') {
      return e[key];
    }
  }
  return undefined;
}

module.exports = { envVal };
