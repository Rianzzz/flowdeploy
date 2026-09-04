function handleCommandError(res, err) {
  if (err.code === 'MISSING_CONFIG') {
    return res.status(400).json({ error: err.message });
  }
  if (err.code === 'NETWORK_ERROR') {
    return res.status(502).json({ error: err.message });
  }
  console.error(err);
  return res.status(500).json({ error: err.message || 'Erro inesperado.' });
}

module.exports = { handleCommandError };
