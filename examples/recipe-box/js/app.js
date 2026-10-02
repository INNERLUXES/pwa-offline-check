// The recipe list, kept in the page so that it works without a server.
const recipes = ['Lentil soup', 'Flatbread', 'Apple crumble', 'Green salad'];

const list = document.getElementById('recipes');
for (const name of recipes) {
  const item = document.createElement('li');
  item.textContent = name;
  list.appendChild(item);
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/js/sw.js', { scope: '/' });
}
