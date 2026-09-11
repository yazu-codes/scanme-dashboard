/*
|--------------------------------------------------------------------------
| CSV parser
|--------------------------------------------------------------------------
|
| Matches the behaviour from the original dashboard:
|
| - quoted fields
| - escaped quotes ""
| - commas inside quoted fields
| - newlines inside quoted fields
| - \n and \r\n
|
*/

export function parseCsv(text) {
  const rows = []

  let row = []
  let field = ''
  let inQuotes = false
  let i = 0

  const pushField = () => {
    row.push(field)
    field = ''
  }

  const pushRow = () => {
    pushField()
    rows.push(row)
    row = []
  }

  while (i < text.length) {
    const character =
      text[i]

    if (inQuotes) {
      if (character === '"') {
        /*
         * Escaped quote:
         *
         * ""
         */
        if (
          text[i + 1] === '"'
        ) {
          field += '"'
          i += 2
          continue
        }

        inQuotes = false
        i++
        continue
      }

      field += character
      i++
      continue
    }

    if (character === '"') {
      inQuotes = true
      i++
      continue
    }

    if (character === ',') {
      pushField()
      i++
      continue
    }

    if (character === '\r') {
      i++
      continue
    }

    if (character === '\n') {
      pushRow()
      i++
      continue
    }

    field += character
    i++
  }

  /*
   * Last field / row when the file doesn't
   * end with a newline.
   */
  if (
    field.length > 0 ||
    row.length > 0
  ) {
    pushRow()
  }

  /*
   * Drop empty trailing rows.
   */
  return rows.filter(
    row =>
      !(
        row.length === 1 &&
        row[0].trim() === ''
      )
  )
}

/*
|--------------------------------------------------------------------------
| Parse a CSV boolean cell
|--------------------------------------------------------------------------
|
| Accepts common human-entered variants so hand-edited
| spreadsheets don't break the import. Empty/missing
| defaults to true (enabled) to match the "enabled: true"
| default used everywhere else in the app.
|
*/

function parseCsvBoolean(raw) {
  const value =
    (raw ?? '')
      .trim()
      .toLowerCase()

  if (value === '') {
    return true
  }

  return [
    'true',
    '1',
    'yes',
    'y',
  ].includes(value)
}

/*
|--------------------------------------------------------------------------
| CSV rows -> menu items
|--------------------------------------------------------------------------
*/

export function csvRowsToItems(
  rows,
  startOrder = 0
) {
  if (!rows.length) {
    return []
  }

  const header =
    rows[0].map(value =>
      value
        .trim()
        .toLowerCase()
    )

  const colIndex = {}

  header.forEach(
    (value, index) => {
      colIndex[value] =
        index
    }
  )

  /*
   * Same friendly aliases supported by
   * the reference HTML.
   */
  const aliases = {
    name: [
      'name',
      'item',
      'item name',
    ],

    name_en: [
      'name_en',
      'name (english)',
      'name english',
    ],

    price: [
      'price',
    ],

    category: [
      'category',
    ],

    allergens: [
      'allergens',
      'allergen',
    ],

    description: [
      'description',
      'desc',
    ],

    description_en: [
      'description_en',
      'description (english)',
      'description english',
    ],

    picture_url: [
      'picture_url',
      'picture url',
      'image',
      'image_url',
      'image url',
    ],

    display_order_position: [
      'display_order_position',
      'display order',
      'order',
      'display_order',
    ],

    enabled: [
      'enabled',
      'active',
      'is enabled',
      'is active',
    ],
  }

  function findColumn(field) {
    for (
      const alias
      of aliases[field]
    ) {
      if (
        colIndex[alias] !==
        undefined
      ) {
        return colIndex[alias]
      }
    }

    return undefined
  }

  const columns = {
    name:
      findColumn('name'),

    name_en:
      findColumn('name_en'),

    price:
      findColumn('price'),

    category:
      findColumn('category'),

    allergens:
      findColumn('allergens'),

    description:
      findColumn('description'),

    description_en:
      findColumn('description_en'),

    picture_url:
      findColumn('picture_url'),

    display_order_position:
      findColumn(
        'display_order_position'
      ),

    enabled:
      findColumn('enabled'),
  }

  if (
    columns.name ===
    undefined
  ) {
    throw new Error(
      'CSV needs a "name" column.'
    )
  }

  const items = []

  for (
    let rowIndex = 1;
    rowIndex < rows.length;
    rowIndex++
  ) {
    const row =
      rows[rowIndex]

    if (
      !row ||
      row.every(
        value =>
          value.trim() === ''
      )
    ) {
      continue
    }

    const name =
      (
        row[
          columns.name
        ] || ''
      ).trim()

    /*
     * Name is the only mandatory field.
     */
    if (!name) {
      continue
    }

    const get =
      index => {
        if (
          index === undefined ||
          row[index] === undefined
        ) {
          return ''
        }

        return row[index]
          .trim()
      }

    const priceRaw =
      get(
        columns.price
      )

    const orderRaw =
      get(
        columns
          .display_order_position
      )

    items.push({
      name,

      name_en:
        get(
          columns.name_en
        ),

      price:
        priceRaw
          ? (
              parseFloat(
                priceRaw
              ) || 0
            )
          : 0,

      category:
        get(
          columns.category
        ),

      allergens:
        get(
          columns.allergens
        ),

      description:
        get(
          columns.description
        ),

      description_en:
        get(
          columns.description_en
        ),

      picture_url:
        get(
          columns.picture_url
        ),

      display_order_position:
        orderRaw
          ? (
              parseInt(
                orderRaw,
                10
              ) || 0
            )
          : (
              startOrder +
              items.length
            ),

      enabled:
        parseCsvBoolean(
          get(
            columns.enabled
          )
        ),
    })
  }

  return items
}

/*
|--------------------------------------------------------------------------
| Escape CSV field
|--------------------------------------------------------------------------
*/

export function escapeCsvField(
  field
) {
  if (
    field === null ||
    field === undefined
  ) {
    return ''
  }

  const value =
    String(field)

  if (
    value.includes(',') ||
    value.includes('\n') ||
    value.includes('\r') ||
    value.includes('"')
  ) {
    return (
      '"' +
      value.replace(
        /"/g,
        '""'
      ) +
      '"'
    )
  }

  return value
}

/*
|--------------------------------------------------------------------------
| Menu items -> CSV
|--------------------------------------------------------------------------
*/

export function itemsToCsv(
  items = []
) {
  const header = [
    'name',
    'name_en',
    'price',
    'category',
    'allergens',
    'description',
    'description_en',
    'picture_url',
    'display_order_position',
    'enabled',
  ]

  const rows = [
    header,
  ]

  for (
    const item
    of items
  ) {
    rows.push([
      escapeCsvField(
        item.name ?? ''
      ),

      escapeCsvField(
        item.name_en ?? ''
      ),

      escapeCsvField(
        item.price ?? ''
      ),

      escapeCsvField(
        item.category ?? ''
      ),

      escapeCsvField(
        item.allergens ?? ''
      ),

      escapeCsvField(
        item.description ?? ''
      ),

      escapeCsvField(
        item.description_en ?? ''
      ),

      escapeCsvField(
        item.picture_url ?? ''
      ),

      escapeCsvField(
        item
          .display_order_position ??
        ''
      ),

      escapeCsvField(
        item.enabled === false
          ? 'false'
          : 'true'
      ),
    ])
  }

  return rows
    .map(row =>
      row.join(',')
    )
    .join('\n')
}

/*
|--------------------------------------------------------------------------
| Download CSV
|--------------------------------------------------------------------------
*/

export function downloadCsv(
  csvContent,
  filename
) {
  /*
   * Add UTF-8 BOM.
   *
   * This helps Excel correctly recognize UTF-8,
   * especially important for Bulgarian menu names.
   */
  const blob =
    new Blob(
      [
        '\uFEFF',
        csvContent,
      ],
      {
        type:
          'text/csv;charset=utf-8;',
      }
    )

  const url =
    URL.createObjectURL(
      blob
    )

  const link =
    document.createElement(
      'a'
    )

  link.href =
    url

  link.download =
    filename

  link.style.display =
    'none'

  document.body
    .appendChild(link)

  link.click()

  link.remove()

  URL.revokeObjectURL(
    url
  )
}