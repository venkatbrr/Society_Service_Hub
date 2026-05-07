const fs = require('fs');

const { CATEGORIES, CATEGORY_GROUPS, CATEGORY_COLORS } = require('./constants/categories');

const groupCats = new Set(CATEGORY_GROUPS.flatMap(g => g.categories));

const missingFromGroups = CATEGORIES.filter(c => !groupCats.has(c));
const extraInGroups = Array.from(groupCats).filter(c => !CATEGORIES.includes(c));

console.log('Missing from groups:', missingFromGroups);
console.log('Extra in groups:', extraInGroups);

const missingColors = CATEGORIES.filter(c => !CATEGORY_COLORS[c]);
console.log('Missing colors:', missingColors);
