<script lang="ts">
  import { onMount, tick } from "svelte";
  import type { MenuAPI } from "$lib/types";
  import type { MenuItem, MenuItemBtn } from "./types";
  import { loadTemplates } from "./template";
  import MenuPanel from "./MenuPanel.svelte";

  let items: MenuItem[] = $state([]);
  let cursorX = $state(0);
  let cursorY = $state(0);
  let visible = $state(false);
  let menuReady = $state(false);
  let hoveredIndex = $state(-1);
  let menuEl: HTMLDivElement | undefined = $state();
  let waylandMode = $state(false);

  // Submenu state
  let submenuItems: MenuItem[] | null = $state(null);
  let submenuX = $state(0);
  let submenuY = $state(0);
  let submenuParentIndex = $state(-1);
  let submenuHoveredIndex = $state(-1);
  let submenuEl: HTMLDivElement | undefined = $state();

  const CURSOR_DEADLINE_MS = 200;

  function getApi(): MenuAPI {
    return window.menuApi!;
  }

  /** Once we know the cursor position, clamp the menu and make it visible. */
  function commitMenuPosition(api: MenuAPI) {
    tick().then(() => {
      if (!menuEl) return;
      if (waylandMode) {
        const rect = menuEl.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        if (cursorX + rect.width > vw) cursorX = vw - rect.width;
        if (cursorY + rect.height > vh) cursorY = vh - rect.height;
        if (cursorX < 0) cursorX = 0;
        if (cursorY < 0) cursorY = 0;
      } else {
        const rect = menuEl.getBoundingClientRect();
        api.reportSize(Math.ceil(rect.width), Math.ceil(rect.height));
      }
      tick().then(() => {
        menuReady = true;
      });
    });
  }

  /**
   * Wayland cursor capture: the compositor will send a pointermove event into
   * the overlay once it's shown. We listen for that event up to a deadline,
   * similar to the native @open-orpheus/ui implementation.
   */
  function setupCursorCapture(): {
    promise: Promise<void>;
    startDeadline: () => void;
  } {
    let captured = false;
    let resolvePromise: (() => void) | null = null;

    const promise = new Promise<void>((resolve) => {
      resolvePromise = resolve;
    });

    const finish = () => {
      resolvePromise?.();
    };

    const capture = (e: PointerEvent | MouseEvent) => {
      if (captured) return;
      captured = true;
      cleanup();
      cursorX = e.clientX;
      cursorY = e.clientY;
      finish();
    };

    const cleanup = () => {
      document.removeEventListener("pointerover", capture);
      document.removeEventListener("pointermove", capture);
      document.documentElement.removeEventListener("pointerenter", capture);
      document.removeEventListener("mouseover", capture);
      document.removeEventListener("mousemove", capture);
    };

    document.addEventListener("pointerover", capture);
    document.addEventListener("pointermove", capture);
    document.documentElement.addEventListener("pointerenter", capture);
    document.addEventListener("mouseover", capture);
    document.addEventListener("mousemove", capture);

    const startDeadline = () => {
      if (captured) return;
      setTimeout(() => {
        if (captured) return;
        captured = true;
        cleanup();
        finish();
      }, CURSOR_DEADLINE_MS);
    };

    return { promise, startDeadline };
  }

  onMount(() => {
    const api = getApi();
    waylandMode = api.isWayland();

    if (waylandMode) {
      const cursor = setupCursorCapture();

      api.pull().then((data) => {
        loadTemplates(data.templates);
        items = data.items as MenuItem[];
        hoveredIndex = -1;
        submenuItems = null;
        submenuParentIndex = -1;
        submenuHoveredIndex = -1;
        visible = true;

        cursor.startDeadline();

        cursor.promise.then(() => {
          commitMenuPosition(api);
        });
      });

      api.onUpdate((rawItems) => {
        items = rawItems as MenuItem[];
      });
    } else {
      api.onShow((rawItems, templates, cx, cy) => {
        loadTemplates(templates);
        items = rawItems as MenuItem[];
        hoveredIndex = -1;
        submenuItems = null;
        submenuParentIndex = -1;
        submenuHoveredIndex = -1;
        visible = true;
        cursorX = cx;
        cursorY = cy;
        menuReady = true;
        commitMenuPosition(api);
      });

      api.onUpdate((rawItems) => {
        items = rawItems as MenuItem[];
      });
    }
  });

  function handleItemClick(item: MenuItem) {
    if (!item.enable) return;
    if (item.menu && item.children?.length) return;
    getApi().itemClick(item.menu_id);
  }

  function handleBtnClick(btn: MenuItemBtn) {
    if (!btn.enable) return;
    getApi().btnClick(btn.id);
  }

  function handleItemHover(index: number, item: MenuItem, event: MouseEvent) {
    hoveredIndex = index;
    if (item.menu && item.children?.length && menuEl) {
      const target = event.currentTarget as HTMLElement;
      const rect = target.getBoundingClientRect();
      const menuRect = menuEl.getBoundingClientRect();
      submenuX = waylandMode ? rect.right : menuRect.width;
      submenuY = waylandMode ? rect.top : rect.top - menuRect.top;
      submenuItems = item.children;
      submenuParentIndex = index;
      submenuHoveredIndex = -1;

      tick().then(() => {
        if (!submenuEl) return;
        const subRect = submenuEl.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        if (waylandMode) {
          if (submenuX + subRect.width > vw)
            submenuX = rect.left - subRect.width;
          if (submenuY + subRect.height > vh) submenuY = vh - subRect.height;
        }
      });
    } else {
      submenuItems = null;
      submenuParentIndex = -1;
    }
  }

  function handleItemLeave(index: number) {
    if (hoveredIndex === index && submenuParentIndex !== index)
      hoveredIndex = -1;
  }

  function handleSubmenuItemClick(item: MenuItem) {
    if (!item.enable) return;
    if (item.menu && item.children?.length) return;
    getApi().itemClick(item.menu_id);
  }

  function handleOverlayClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      getApi().close();
      visible = false;
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      getApi().close();
      visible = false;
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if visible}
  {#if waylandMode}
    <!-- Wayland: fullscreen transparent overlay with menu positioned at cursor -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="fixed inset-0 z-99999" onclick={handleOverlayClick}>
      <MenuPanel
        {items}
        {hoveredIndex}
        onitemclick={handleItemClick}
        onitemhover={handleItemHover}
        onitemleave={handleItemLeave}
        onbtnclick={handleBtnClick}
        bind:el={menuEl}
        style="left: {cursorX}px; top: {cursorY}px; visibility: {menuReady
          ? 'visible'
          : 'hidden'};"
      />

      {#if submenuItems}
        <MenuPanel
          items={submenuItems}
          hoveredIndex={submenuHoveredIndex}
          onitemclick={handleSubmenuItemClick}
          onitemhover={(j) => {
            submenuHoveredIndex = j;
          }}
          onitemleave={() => {
            submenuHoveredIndex = -1;
          }}
          onbtnclick={handleBtnClick}
          showSubmenuArrows={false}
          bind:el={submenuEl}
          style="left: {submenuX}px; top: {submenuY}px;"
        />
      {/if}
    </div>
  {:else}
    <!-- Non-Wayland: the BrowserWindow IS the popup, no overlay needed -->
    <MenuPanel
      {items}
      {hoveredIndex}
      onitemclick={handleItemClick}
      onitemhover={handleItemHover}
      onitemleave={handleItemLeave}
      onbtnclick={handleBtnClick}
      bind:el={menuEl}
    />
  {/if}
{/if}
