// WI Active Monitor
// Shows a draggable, collapsible widget listing which World Info entries are
// currently enabled (not toggled off) across a set of books you choose to watch.
// Built against the SillyTavern extension context API (SillyTavern.getContext()).

const MODULE_NAME = 'wiActiveMonitor';

const defaultSettings = Object.freeze({
    enabled: true,
    watchedBooks: /** @type {string[]} */ ([]),
    hideWhenEmpty: true,
    pollSeconds: 10,
    collapsed: false,
    widgetX: /** @type {number|null} */ (null),
    widgetY: /** @type {number|null} */ (null),
});

/** @type {ReturnType<typeof SillyTavern.getContext>} */
let context;

/** @type {JQuery<HTMLElement>} */
let widgetEl;
/** @type {JQuery<HTMLElement>} */
let headerEl;
/** @type {JQuery<HTMLElement>} */
let bookSelectContainerEl;
/** @type {JQuery<HTMLElement>|null} */
let currentSelect2El = null;

let pollHandle = null;
let refreshInFlight = null;
let dragState = null;
let suppressNextClick = false;

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

// ---------------------------------------------------------------------------
// Widget: a single draggable, collapsible box (header + list)
// ---------------------------------------------------------------------------

function clampPosition(left, top, width, height) {
    const maxLeft = Math.max(0, window.innerWidth - width);
    const maxTop = Math.max(0, window.innerHeight - height);
    return {
        left: Math.min(Math.max(0, left), maxLeft),
        top: Math.min(Math.max(0, top), maxTop),
    };
}

function applyStoredPosition() {
    const settings = getSettings();
    if (settings.widgetX == null || settings.widgetY == null) {
        // No stored position yet: leave the CSS default (bottom-right) in place.
        return;
    }
    const rect = widgetEl[0].getBoundingClientRect();
    const clamped = clampPosition(settings.widgetX, settings.widgetY, rect.width, rect.height);
    widgetEl.css({ right: 'auto', bottom: 'auto', left: `${clamped.left}px`, top: `${clamped.top}px` });
}

function resetWidgetPosition() {
    const settings = getSettings();
    settings.widgetX = null;
    settings.widgetY = null;
    context.saveSettingsDebounced();
    widgetEl.css({ left: '', top: '', right: '', bottom: '' });
}

function onPointerDown(e) {
    if (e.button !== undefined && e.button !== 0) return;
    const rect = widgetEl[0].getBoundingClientRect();
    // Lock in explicit left/top so dragging is simple delta math regardless
    // of whether we're currently anchored via the default right/bottom CSS
    // or a previously stored left/top.
    widgetEl.css({ right: 'auto', bottom: 'auto', left: `${rect.left}px`, top: `${rect.top}px` });
    dragState = {
        startX: e.clientX,
        startY: e.clientY,
        origLeft: rect.left,
        origTop: rect.top,
        moved: false,
    };
}

function onPointerMove(e) {
    if (!dragState) return;
    const dx = e.clientX - dragState.startX;
    const dy = e.clientY - dragState.startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
        dragState.moved = true;
    }
    if (!dragState.moved) return;
    const rect = widgetEl[0].getBoundingClientRect();
    const clamped = clampPosition(dragState.origLeft + dx, dragState.origTop + dy, rect.width, rect.height);
    widgetEl.css({ left: `${clamped.left}px`, top: `${clamped.top}px` });
}

function onPointerUp() {
    if (!dragState) return;
    if (dragState.moved) {
        const rect = widgetEl[0].getBoundingClientRect();
        const settings = getSettings();
        settings.widgetX = rect.left;
        settings.widgetY = rect.top;
        context.saveSettingsDebounced();
        suppressNextClick = true;
    }
    dragState = null;
}

function toggleCollapsed() {
    const settings = getSettings();
    settings.collapsed = !settings.collapsed;
    context.saveSettingsDebounced();
    applyCollapsedState();
}

function applyCollapsedState() {
    const settings = getSettings();
    widgetEl.toggleClass('wiam-collapsed', settings.collapsed);
    widgetEl.toggleClass('wiam-expanded', !settings.collapsed);
    widgetEl
        .find('.wiam-toggle')
        .removeClass('fa-chevron-down fa-chevron-up')
        .addClass(settings.collapsed ? 'fa-chevron-down' : 'fa-chevron-up');
}

function buildWidget() {
    widgetEl = $(
        '<div id="wiam_widget" class="wiam-widget wiam-expanded">' +
        '<div class="wiam-header">' +
        '<i class="fa-solid fa-triangle-exclamation"></i>' +
        '<span class="wiam-count">0</span>' +
        '<span class="wiam-label">WI entries active</span>' +
        '<i class="fa-solid fa-chevron-up wiam-toggle"></i>' +
        '</div>' +
        '<div class="wiam-list"></div>' +
        '</div>',
    );
    widgetEl.hide(); // avoid a flash before the first refresh decides visibility
    headerEl = widgetEl.find('.wiam-header');

    headerEl.on('pointerdown', onPointerDown);
    $(window).on('pointermove', onPointerMove);
    $(window).on('pointerup', onPointerUp);
    headerEl.on('click', () => {
        if (suppressNextClick) {
            suppressNextClick = false;
            return;
        }
        toggleCollapsed();
    });

    $('body').append(widgetEl);
    applyCollapsedState();
    applyStoredPosition();
}

function renderWidgetContent(total, results) {
    const settings = getSettings();
    widgetEl.find('.wiam-count').text(total);

    if (total === 0 && settings.hideWhenEmpty) {
        widgetEl.hide();
        return;
    }
    widgetEl.show();

    const listEl = widgetEl.find('.wiam-list');
    listEl.empty();

    if (results.length === 0) {
        listEl.append($('<div class="wiam-empty-hint"></div>').text('No active entries in the monitored books.'));
        return;
    }

    for (const r of results) {
        const $line = $('<div class="wiam-book-line"></div>');
        $line.append($('<strong></strong>').text(`${r.book}: `));
        $line.append($('<span class="wiam-count-inline"></span>').text(`${r.count}`));
        $line.append($('<span class="wiam-names"></span>').text(` (${r.entries.join(', ')})`));
        listEl.append($line);
    }
}

async function refresh() {
    const settings = getSettings();

    if (!settings.enabled) {
        widgetEl?.hide();
        return;
    }

    if (refreshInFlight) {
        return refreshInFlight;
    }

    refreshInFlight = (async () => {
        const { total, results } = await collectActiveEntries();
        renderWidgetContent(total, results);
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

function applyEnabledState() {
    const settings = getSettings();
    if (!settings.enabled) {
        widgetEl.hide();
        clearInterval(pollHandle);
    } else {
        setupPolling();
        refresh();
    }
}

// ---------------------------------------------------------------------------
// Book selector: Select2 search/chip UI when available, plain fallback otherwise
// ---------------------------------------------------------------------------

function hasSelect2() {
    return typeof $.fn !== 'undefined' && typeof $.fn.select2 === 'function';
}

function setAllBooks(state) {
    const settings = getSettings();
    const names = safeGetWorldNames();
    settings.watchedBooks = state ? [...names] : [];
    context.saveSettingsDebounced();
    renderBookSelector();
    refresh();
}

function buildSelect2Selector($container, names, settings) {
    const $select = $('<select multiple class="wiam-book-select" style="width:100%"></select>');
    for (const name of names) {
        const $opt = $('<option></option>').val(name).text(name);
        if (settings.watchedBooks.includes(name)) {
            $opt.prop('selected', true);
        }
        $select.append($opt);
    }
    $container.append($select);
    $select.select2({
        width: '100%',
        placeholder: 'Search books to monitor…',
        closeOnSelect: false,
        dropdownParent: $container,
    });
    $select.on('change', function () {
        settings.watchedBooks = $(this).val() || [];
        context.saveSettingsDebounced();
        refresh();
    });
    return $select;
}

function buildFallbackSelector($container, names, settings) {
    const $box = $('<div class="wiam-tagbox"></div>');
    const $chips = $('<div class="wiam-chips"></div>');
    const $input = $('<input type="text" class="wiam-tag-input" placeholder="Search books…" />');
    const $dropdown = $('<div class="wiam-tag-dropdown"></div>').hide();

    $box.append($chips, $input, $dropdown);
    $container.append($box);

    function renderChips() {
        $chips.empty();
        for (const name of settings.watchedBooks) {
            const $chip = $('<span class="wiam-chip"></span>');
            $chip.append($('<span></span>').text(name));
            const $x = $('<i class="fa-solid fa-xmark"></i>').on('click', (e) => {
                e.stopPropagation();
                const idx = settings.watchedBooks.indexOf(name);
                if (idx !== -1) settings.watchedBooks.splice(idx, 1);
                context.saveSettingsDebounced();
                renderChips();
                renderDropdown();
                refresh();
            });
            $chip.append($x);
            $chips.append($chip);
        }
    }

    function renderDropdown() {
        const query = String($input.val() || '').toLowerCase().trim();
        const available = names.filter(
            (n) => !settings.watchedBooks.includes(n) && n.toLowerCase().includes(query),
        );
        $dropdown.empty();
        if (available.length === 0) {
            $dropdown.append($('<div class="wiam-tag-empty"></div>').text('No matches'));
            return;
        }
        for (const name of available) {
            const $item = $('<div class="wiam-tag-item"></div>').text(name);
            // mousedown (not click) so it fires before the input's blur hides the dropdown
            $item.on('mousedown', (e) => {
                e.preventDefault();
                settings.watchedBooks.push(name);
                context.saveSettingsDebounced();
                $input.val('');
                renderChips();
                renderDropdown();
                refresh();
            });
            $dropdown.append($item);
        }
    }

    $input.on('focus', () => {
        renderDropdown();
        $dropdown.show();
    });
    $input.on('input', () => {
        renderDropdown();
        $dropdown.show();
    });
    $input.on('blur', () => {
        setTimeout(() => $dropdown.hide(), 150);
    });
    $input.on('keydown', (e) => {
        if (e.key === 'Backspace' && $input.val() === '' && settings.watchedBooks.length > 0) {
            settings.watchedBooks.pop();
            context.saveSettingsDebounced();
            renderChips();
            renderDropdown();
            refresh();
        }
    });

    renderChips();
    renderDropdown();
}

function renderBookSelector() {
    const settings = getSettings();
    const names = safeGetWorldNames();

    // Drop watched books that no longer exist (renamed/deleted).
    const pruned = settings.watchedBooks.filter((n) => names.includes(n));
    if (pruned.length !== settings.watchedBooks.length) {
        settings.watchedBooks = pruned;
        context.saveSettingsDebounced();
    }

    if (currentSelect2El) {
        try {
            currentSelect2El.select2('destroy');
        } catch (err) {
            // ignore
        }
        currentSelect2El = null;
    }
    bookSelectContainerEl.empty();

    if (names.length === 0) {
        bookSelectContainerEl.append($('<div class="wiam-empty-hint"></div>').text('No World Info books found.'));
        return;
    }

    if (hasSelect2()) {
        currentSelect2El = buildSelect2Selector(bookSelectContainerEl, names, settings);
    } else {
        buildFallbackSelector(bookSelectContainerEl, names, settings);
    }
}

// ---------------------------------------------------------------------------
// Settings panel
// ---------------------------------------------------------------------------

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
    $hideLabel.append($hideCheckbox, $('<span></span>').text('Hide widget when nothing is active'));

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

    const $posRow = $('<div class="wiam-row"></div>');
    $posRow.append($('<span></span>').text('Widget position'));
    const $resetPos = $('<a href="#">Reset to default corner</a>').on('click', (e) => {
        e.preventDefault();
        resetWidgetPosition();
    });
    $posRow.append($resetPos);

    const $bookHeader = $('<div class="wiam-row wiam-books-header"></div>');
    $bookHeader.append($('<span></span>').text('Books to monitor'));
    const $bookActions = $('<div class="wiam-book-actions"></div>');
    const $selectAll = $('<a href="#">All</a>').on('click', (e) => {
        e.preventDefault();
        setAllBooks(true);
    });
    const $selectNone = $('<a href="#">None</a>').on('click', (e) => {
        e.preventDefault();
        setAllBooks(false);
    });
    const $rescan = $('<a href="#" title="Rescan available lorebooks"><i class="fa-solid fa-rotate"></i></a>').on(
        'click',
        (e) => {
            e.preventDefault();
            renderBookSelector();
        },
    );
    $bookActions.append($selectAll, $selectNone, $rescan);
    $bookHeader.append($bookActions);

    bookSelectContainerEl = $('<div class="wiam-book-select-container"></div>');

    const $refreshBtn = $('<button class="menu_button">Refresh now</button>').on('click', () => refresh());

    $body.append($enabledLabel, $hideLabel, $pollRow, $posRow, $bookHeader, bookSelectContainerEl, $refreshBtn);
    $drawer.append($header, $body);

    const $container = $('#extensions_settings2').length ? $('#extensions_settings2') : $('#extensions_settings');
    $container.append($drawer);

    renderBookSelector();
}

// ---------------------------------------------------------------------------
// Events + init
// ---------------------------------------------------------------------------

function wireEvents() {
    const onWorldInfoChange = () => refresh();
    context.eventSource.on(context.eventTypes.WORLDINFO_UPDATED, onWorldInfoChange);
    context.eventSource.on(context.eventTypes.WORLDINFO_SETTINGS_UPDATED, onWorldInfoChange);
    context.eventSource.on(context.eventTypes.CHAT_CHANGED, onWorldInfoChange);
    // Auto-fires immediately if attached after the app is already ready.
    context.eventSource.on(context.eventTypes.APP_READY, () => {
        renderBookSelector();
        refresh();
    });

    window.addEventListener('resize', () => {
        const settings = getSettings();
        if (settings.widgetX != null && settings.widgetY != null) {
            applyStoredPosition();
        }
    });
}

jQuery(async () => {
    context = SillyTavern.getContext();

    if (!context || typeof context.loadWorldInfo !== 'function' || typeof context.getWorldInfoNames !== 'function') {
        console.error(`[${MODULE_NAME}] Required World Info context functions are not available. Extension disabled.`);
        return;
    }

    buildWidget();
    buildSettingsPanel();
    wireEvents();
    applyEnabledState();
});
