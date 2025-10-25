// Usage:
// 1) Install dep: npm i xlsx --save-dev (or --save)
// 2) Run: node scripts/import-cities.js "/Users/novikov/Desktop/TZ/spisok.xlsx"
//    If path is omitted, defaults to /Users/novikov/Desktop/TZ/spisok.xlsx
// The script will merge unique cities into lib/cities.ts (array RU_CITIES)

const fs = require('fs')
const path = require('path')
let XLSX
try {
  XLSX = require('xlsx')
} catch (e) {
  console.error('\n[import-cities] Не найден пакет "xlsx". Установите командой:')
  console.error('  npm i xlsx --save-dev')
  process.exit(1)
}

const excelPath = process.argv[2] || '/Users/novikov/Desktop/TZ/spisok.xlsx'
const repoRoot = process.cwd()
const citiesTsPath = path.join(repoRoot, 'lib', 'cities.ts')

function readExcelCities(file) {
  if (!fs.existsSync(file)) throw new Error(`Файл не найден: ${file}`)
  const wb = XLSX.readFile(file)
  const sheetName = wb.SheetNames[0]
  const ws = wb.Sheets[sheetName]
  // Сначала пробуем прочитать как объекты с заголовками
  const rowsObj = XLSX.utils.sheet_to_json(ws, { defval: '' })
  const cityKeys = ['город', 'города', 'city']
  const regionKeys = ['регион', 'субъект', 'область', 'край', 'республика']
  if (rowsObj.length > 0) {
    const cols = Object.keys(rowsObj[0] || {}).reduce((acc, k) => { acc[k.toLowerCase()] = k; return acc }, {})
    const cityCol = cityKeys.map(k => cols[k]).find(Boolean)
    // regionCol может пригодиться позже
    // const regionCol = regionKeys.map(k => cols[k]).find(Boolean)
    if (cityCol) {
      const list = []
      for (const r of rowsObj) {
        let c = String(r[cityCol] || '').trim()
        if (!c) continue
        c = c.replace(/\s+/g, ' ').replace(/\s*-\s*/g, '-').trim()
        list.push(c)
      }
      if (list.length > 0) return list
    }
  }
  // Фоллбэк: читаем как массивы (без заголовков) и берём первый столбец (A)
  const rowsArr = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  const list = []
  for (const row of rowsArr) {
    if (!Array.isArray(row)) continue
    let c = String((row[0] ?? '').toString()).trim()
    if (!c) continue
    c = c.replace(/\s+/g, ' ').replace(/\s*-\s*/g, '-').trim()
    list.push(c)
  }
  return list
}

function parseExistingCities(ts) {
  // Ищем все строки в кавычках внутри RU_CITIES массива
  const arrMatch = ts.match(/export const RU_CITIES: string\[] = \[([\s\S]*?)\]/)
  if (!arrMatch) throw new Error('Не удалось найти RU_CITIES в lib/cities.ts')
  const body = arrMatch[1]
  const quoted = body.match(/'([^']*)'|"([^"]*)"/g) || []
  return quoted.map(q => q.slice(1, -1))
}

function uniqueMerge(base, add) {
  const seen = new Map()
  for (const c of base) {
    seen.set(c.toLowerCase(), c)
  }
  for (const c of add) {
    const key = c.toLowerCase()
    if (!seen.has(key)) seen.set(key, c)
  }
  return Array.from(seen.values())
}

function renderCitiesTs(cities) {
  const header = `// Список городов РФ (расширяемый).\n// Сгенерировано скриптом scripts/import-cities.js\nexport const RU_CITIES: string[] = [\n`
  const items = cities.map(c => `  '${c}',`).join('\n')
  const footer = `\n]\n\nexport function isValidCity(city?: string | null): boolean {\n  if (!city) return false\n  const c = city.trim()\n  if (!c) return false\n  return RU_CITIES.some(x => x.toLowerCase() === c.toLowerCase())\n}\n\nexport function normalizeCity(city: string): string {\n  const found = RU_CITIES.find(x => x.toLowerCase() === city.trim().toLowerCase())\n  return found || city.trim()\n}\n`
  return header + items + footer
}

function main() {
  console.log('[import-cities] Читаю Excel:', excelPath)
  const addCities = readExcelCities(excelPath)
  console.log(`[import-cities] Найдено в Excel: ${addCities.length}`)
  const ts = fs.readFileSync(citiesTsPath, 'utf8')
  const baseCities = parseExistingCities(ts)
  console.log(`[import-cities] Уже в списке: ${baseCities.length}`)
  const merged = uniqueMerge(baseCities, addCities)
  console.log(`[import-cities] После объединения: ${merged.length} (добавлено ${merged.length - baseCities.length})`)
  // Сохраняем с минимальной перезаписью: только блок массива и функций
  const newTs = renderCitiesTs(merged)
  fs.writeFileSync(citiesTsPath, newTs, 'utf8')
  console.log('[import-cities] Готово: обновлён lib/cities.ts')
}

try {
  main()
} catch (e) {
  console.error('[import-cities] Ошибка:', e.message || e)
  process.exit(1)
}
