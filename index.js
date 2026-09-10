// WI Active Monitor
// Shows a small bubble/panel listing which World Info entries are currently
// enabled (not toggled off) across a set of books you choose to watch.
// Built against the SillyTavern extension context API (SillyTavern.getContext()).

const MODULE_NAME = 'wiActiveMonitor';

const defaultSettings = Object.freeze({
    enabled: true,
    watchedBooks: /** @type {string[]} */ ([]),
    hideWhenEmpty: true,
    pollSeconds: 10,
    position: 'bottom-right', // bottom-right | bottom-left | top-right | top-left
});

/** @type {ReturnType<typeof SillyTavern.getContext>} */
let context;

/** @type {JQuery<HTMLElement>} */
let bubbleEl;
/** @type {JQuery<HTMLElement>} */
let panelEl;
/** @type {JQuery<HTMLElement>} */
let bookListEl;

let pollHandle = null;
let refreshInFlight = null;

function getSettings() {
    const store = context.extensionSettings;
    if (!store[MODULE_NAME]) {
        store[MODULE_NAME] = structuredClone(defaultSettings);
    }
    for (const key of Object.keys(defaultSettings)) {
        if (!Object.hasOwn(store[MODULE_NAME], key)) {
            store[MODULE_NAME][key] = defaultSettings[key];
        }
    }
    return store[MODULE_NAME];
}

function safeGetWorldNames() {
    try {
        const names = context.getWorldInfoNames();
        return Array.isArray(names) ? names : [];
    } catch (err) {
        console.error(`[${MODULE_NAME}] Failed to get World Info book names`, err);
        return [];
    }
}

function entryLabel(entry) {
    if (entry.comment && String(entry.comment).trim()) {
        return String(entry.comment).trim();
    }
    if (Array.isArray(entry.key) && entry.key.length > 0 && entry.key[0]) {
        return String(entry.key[0]);
    }
    return `Entry #${entry.uid}`;
}

async function collectActiveEntries() {
    const settings = getSettings();
    const results = [];
    let total = 0;

    for (const bookName of settings.watchedBooks) {
        let data;
        try {
            data = await context.loadWorldInfo(bookName);
        } catch (err) {
            console.error(`[${MODULE_NAME}] Failed to load World Info book "${bookName}"`, err);
            continue;
        }

        if (!data || !data.entries) {
            continue;
        }

        const activeEntries = Object.values(data.entries)
            .filter((entry) => entry && entry.disable !== true)
            .sort((a, b) => (a.uid ?? 0) - (b.uid ?? 0))
            .map(entryLabel);

        if (activeEntries.length > 0) {
            results.push({ book: bookName, count: activeEntries.length, entries: activeEntries });
            total += activeEntries.length;
        }
    }

    return { total, results };
}

function renderBubble(total, results) {
    const settings = getSettings();

    bubbleEl.find('#wiam_bubble_count').text(total);

    if (total === 0 && settings.hideWhenEmpty) {
        bubbleEl.hide();
        panelEl.hide();
        return;
    }

    bubbleEl.show();

    const listEl = panelEl.find('#wiam_panel_list');
    listEl.empty();

    if (results.length === 0) {
        listEl.append($('<div class="wiam-empty-hint"></div>').text('No active entries in the monitored books.'));
        return;
    }

    for (const r of results) {
        const $line = $('<div class="wiam-book-line"></div>');
        $line.append($('<strong></strong>').text(`${r.book}: `));
        $line.append($('<span class="wiam-count"></span>').text(`${r.count}`));
        $line.append($('<span class="wiam-names"></span>').text(` (${r.entries.join(', ')})`));
        listEl.append($line);
    }
}

async function refresh() {
    const settings = getSettings();

    if (!settings.enabled) {
        bubbleEl?.hide();
        panelEl?.hide();
        return;
    }

    if (refreshInFlight) {
        return refreshInFlight;
    }

    refreshInFlight = (async () => {
        const { total, results } = await collectActiveEntries();
        renderBubble(total, results);
    })();

    try {
        await refreshInFlight;
    } finally {
        refreshInFlight = null;
    }
}

function setupPolling() {
    clearInterval(pollHandle);
    const settings = getSettings();
    if (!settings.enabled || !(settings.pollSeconds > 0)) {
        return;
    }
    pollHandle = setInterval(() => refresh(), settings.pollSeconds * 1000);
}

function applyPosition() {
    const settings = getSettings();
    const positions = ['bottom-right', 'bottom-left', 'top-right', 'top-left'];
    const classes = positions.map((p) => `wiam-pos-${p}`).join(' ');
    bubbleEl.removeClass(classes).addClass(`wiam-pos-${settings.position}`);
    panelEl.removeClass(classes).addClass(`wiam-pos-${settings.position}`);
}

function applyEnabledState() {
    const settings = getSettings();
    if (!settings.enabled) {
        bubbleEl.hide();
        panelEl.hide();
        clearInterval(pollHandle);
    } else {
        setupPolling();
        refresh();
    }
}

function setAllBooks(state) {
    const settings = getSettings();
    const names = safeGetWorldNames();
    settings.watchedBooks = state ? [...names] : [];
    context.saveSettingsDebounced();
    renderBookList();
    refresh();
}

function renderBookList() {
    const settings = getSettings();
    const names = safeGetWorldNames();

    // Drop watched books that no longer exist (renamed/deleted).
    const pruned = settings.watchedBooks.filter((n) => names.includes(n));
    if (pruned.length !== settings.watchedBooks.length) {
        settings.watchedBooks = pruned;
        context.saveSettingsDebounced();
    }

    bookListEl.empty();

    if (names.length === 0) {
        bookListEl.append($('<div class="wiam-empty-hint"></div>').text('No World Info books found.'));
        return;
    }

    for (const name of names) {
        const $label = $('<label class="checkbox_label wiam-book-item"></label>');
        const $checkbox = $('<input type="checkbox" />');
        $checkbox.prop('checked', settings.watchedBooks.includes(name));
        $checkbox.on('change', function () {
            const checked = $(this).is(':checked');
            const idx = settings.watchedBooks.indexOf(name);
            if (checked && idx === -1) settings.watchedBooks.push(name);
            if (!checked && idx !== -1) settings.watchedBooks.splice(idx, 1);
            context.saveSettingsDebounced();
            refresh();
        });
        const $span = $('<span></span>').text(name);
        $label.append($checkbox, $span);
        bookListEl.append($label);
    }
}

function buildSettingsPanel() {
    const settings = getSettings();

    const $drawer = $('<div class="inline-drawer wiam-settings"></div>');
    const $header = $(
        '<div class="inline-drawer-toggle inline-drawer-header">' +
        '<b>WI Active Monitor</b>' +
        '<div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>' +
        '</div>',
    );
    const $body = $('<div class="inline-drawer-content"></div>');

    const $enabledLabel = $('<label class="checkbox_label"></label>');
    const $enabledCheckbox = $('<input type="checkbox" />').prop('checked', settings.enabled).on('change', function () {
        settings.enabled = $(this).is(':checked');
        context.saveSettingsDebounced();
        applyEnabledState();
    });
    $enabledLabel.append($enabledCheckbox, $('<span></span>').text('Enable monitor'));

    const $hideLabel = $('<label class="checkbox_label"></label>');
    const $hideCheckbox = $('<input type="checkbox" />').prop('checked', settings.hideWhenEmpty).on('change', function () {
        settings.hideWhenEmpty = $(this).is(':checked');
        context.saveSettingsDebounced();
        refresh();
    });
    $hideLabel.append($hideCheckbox, $('<span></span>').text('Hide bubble when nothing is active'));

    const $positionRow = $('<div class="wiam-row"></div>');
    $positionRow.append($('<label for="wiam_position"></label>').text('Bubble position'));
    const $positionSelect = $(
        '<select id="wiam_position">' +
        '<option value="bottom-right">Bottom right</option>' +
        '<option value="bottom-left">Bottom left</option>' +
        '<option value="top-right">Top right</option>' +
        '<option value="top-left">Top left</option>' +
        '</select>',
    );
    $positionSelect.val(settings.position).on('change', function () {
        settings.position = $(this).val();
        context.saveSettingsDebounced();
        applyPosition();
    });
    $positionRow.append($positionSelect);

    const $pollRow = $('<div class="wiam-row"></div>');
    $pollRow.append($('<label for="wiam_poll"></label>').text('Auto-refresh every (seconds, 0 = off)'));
    const $pollInput = $('<input type="number" id="wiam_poll" min="0" max="120" step="1" />').val(settings.pollSeconds);
    $pollInput.on('change', function () {
        const val = Math.max(0, Math.min(120, Number($(this).val()) || 0));
        settings.pollSeconds = val;
        $(this).val(val);
        context.saveSettingsDebounced();
        setupPolling();
    });
    $pollRow.append($pollInput);

    const $bookHeader = $('<div class="wiam-row wiam-books-header"></div>');
    $bookHeader.append($('<span></span>').text('Books to monitor'));
    const $bookActions = $('<div class="wiam-book-actions"></div>');
    const $selectAll = $('<a href="#">All</a>').on('click', (e) => { e.preventDefault(); setAllBooks(true); });
    const $selectNone = $('<a href="#">None</a>').on('click', (e) => { e.preventDefault(); setAllBooks(false); });
    const $rescan = $('<a href="#" title="Rescan available lorebooks"><i class="fa-solid fa-rotate"></i></a>')
        .on('click', (e) => { e.preventDefault(); renderBookList(); });
    $bookActions.append($selectAll, $selectNone, $rescan);
    $bookHeader.append($bookActions);

    bookListEl = $('<div class="wiam-book-list"></div>');

    const $refreshBtn = $('<button class="menu_button">Refresh now</button>').on('click', () => refresh());

    $body.append($enabledLabel, $hideLabel, $positionRow, $pollRow, $bookHeader, bookListEl, $refreshBtn);
    $drawer.append($header, $body);

    const $container = $('#extensions_settings2').length ? $('#extensions_settings2') : $('#extensions_settings');
    $container.append($drawer);

    renderBookList();
}

function buildBubble() {
    bubbleEl = $(
        '<div id="wiam_bubble" class="wiam-bubble" title="WI entries active">' +
        '<i class="fa-solid fa-triangle-exclamation"></i>' +
        '<span id="wiam_bubble_count">0</span>' +
        '</div>',
    );
    panelEl = $(
        '<div id="wiam_panel" class="wiam-panel">' +
        '<div class="wiam-panel-header">' +
        '<span>WI entries active</span>' +
        '<i class="fa-solid fa-xmark wiam-panel-close"></i>' +
        '</div>' +
        '<div id="wiam_panel_list" class="wiam-panel-list"></div>' +
        '</div>',
    );
    panelEl.hide();

    bubbleEl.on('click', () => panelEl.toggle());
    panelEl.find('.wiam-panel-close').on('click', () => panelEl.hide());

    $('body').append(bubbleEl, panelEl);
    applyPosition();
}

function wireEvents() {
    const onWorldInfoChange = () => refresh();
    context.eventSource.on(context.eventTypes.WORLDINFO_UPDATED, onWorldInfoChange);
    context.eventSource.on(context.eventTypes.WORLDINFO_SETTINGS_UPDATED, onWorldInfoChange);
    context.eventSource.on(context.eventTypes.CHAT_CHANGED, onWorldInfoChange);
    // Auto-fires immediately if attached after the app is already ready.
    context.eventSource.on(context.eventTypes.APP_READY, () => {
        renderBookList();
        refresh();
    });
}

jQuery(async () => {
    context = SillyTavern.getContext();

    if (!context || typeof context.loadWorldInfo !== 'function' || typeof context.getWorldInfoNames !== 'function') {
        console.error(`[${MODULE_NAME}] Required World Info context functions are not available. Extension disabled.`);
        return;
    }

    buildSettingsPanel();
    buildBubble();
    wireEvents();
    applyEnabledState();
});
