const BASE_URL = 'https://api.opendota.com/api';

async function fetchJson(path) {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: { accept: 'application/json' }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenDota request failed (${response.status}): ${text.slice(0, 200)}`);
  }

  return response.json();
}

async function fetchItemsConstants() {
  return fetchJson('/constants/items');
}

async function fetchHeroItemPopularity(heroId) {
  return fetchJson(`/heroes/${heroId}/itemPopularity`);
}

module.exports = {
  fetchItemsConstants,
  fetchHeroItemPopularity
};