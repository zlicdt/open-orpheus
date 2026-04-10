<script lang="ts">
  import type { MenuItem, MenuItemBtn, LayoutNode } from "./types";
  import { parseBtnUrl, getCachedTemplate, btnStateSrc } from "./template";

  let {
    items,
    hoveredIndex,
    showSubmenuArrows = true,
    style,
    el = $bindable(),
    onitemclick,
    onitemhover,
    onitemleave,
    onbtnclick,
  }: {
    items: MenuItem[];
    hoveredIndex: number;
    showSubmenuArrows?: boolean;
    style?: string;
    el?: HTMLDivElement;
    onitemclick?: (item: MenuItem) => void;
    onitemhover?: (index: number, item: MenuItem, event: MouseEvent) => void;
    onitemleave?: (index: number) => void;
    onbtnclick?: (btn: MenuItemBtn) => void;
  } = $props();

  // Panel-local btn interaction state
  let hoveredBtnId: string | null = $state(null);
  let pressedBtnId: string | null = $state(null);
</script>

{#snippet layoutNode(node: LayoutNode, btns: MenuItemBtn[])}
  {#if node.type === "horizontal"}
    <div class="flex flex-row items-center">
      {#each node.children as child, ci (ci)}
        {@render layoutNode(child, btns)}
      {/each}
    </div>
  {:else if node.type === "vertical"}
    <div class="flex flex-col">
      {#each node.children as child, ci (ci)}
        {@render layoutNode(child, btns)}
      {/each}
    </div>
  {:else if node.type === "container"}
    <div
      class="flex shrink-0 flex-row items-center"
      style="{node.width != null ? `width:${node.width}px;` : ''}{node.height !=
      null
        ? `height:${node.height}px;`
        : ''}"
    >
      {#each node.children as child, ci (ci)}
        {@render layoutNode(child, btns)}
      {/each}
    </div>
  {:else if node.type === "control"}
    {#if node.width != null || node.height != null}
      <div
        class="shrink-0"
        style="{node.width != null
          ? `width:${node.width}px;`
          : ''}{node.height != null ? `height:${node.height}px;` : ''}"
      ></div>
    {:else}
      <div class="grow"></div>
    {/if}
  {:else if node.type === "button"}
    {@const btn = btns[node.index]}
    {#if btn}
      {@const images = parseBtnUrl(btn.url)}
      {#if images}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div
          class="flex shrink-0 items-center justify-center {btn.enable
            ? 'cursor-pointer'
            : 'cursor-default opacity-40'}"
          style="width:{node.width}px;height:{node.height}px"
          role="button"
          tabindex="-1"
          onmouseenter={() => {
            if (btn.enable) hoveredBtnId = btn.id;
          }}
          onmouseleave={() => {
            if (hoveredBtnId === btn.id) hoveredBtnId = null;
            pressedBtnId = null;
          }}
          onmousedown={() => {
            if (btn.enable) pressedBtnId = btn.id;
          }}
          onmouseup={() => {
            pressedBtnId = null;
          }}
          onclick={() => onbtnclick?.(btn)}
        >
          <img
            style="width:{node.width}px;height:{node.height}px"
            src={btnStateSrc(
              images,
              btn.enable,
              hoveredBtnId === btn.id,
              pressedBtnId === btn.id
            )}
            alt=""
          />
        </div>
      {/if}
    {/if}
  {/if}
{/snippet}

{#snippet styledItem(item: MenuItem)}
  {@const tpl = item.style ? getCachedTemplate(item.style) : null}
  {#if tpl && item.btns}
    <div
      class="cursor-default select-none"
      style="height:{tpl.height}px;min-width:{tpl.minWidth}px;max-width:{tpl.maxWidth}px"
    >
      {@render layoutNode(tpl.layout, item.btns)}
    </div>
  {/if}
{/snippet}

<div
  class="absolute max-w-80 min-w-45 overflow-hidden rounded-lg border border-black/12 bg-white/98 py-1.5 shadow-[0_4px_16px_rgba(0,0,0,0.15),0_1px_4px_rgba(0,0,0,0.1)] select-none"
  bind:this={el}
  {style}
>
  {#each items as item, i (i)}
    {#if item.separator}
      <div class="mx-3 h-px bg-black/10"></div>
    {:else if item.style && item.btns}
      {@render styledItem(item)}
    {:else}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="flex cursor-default items-center gap-3 px-4 py-2 text-sm whitespace-nowrap text-[#1e1e1e] transition-colors duration-50 {!item.enable
          ? 'pointer-events-none text-[#a0a0a0]'
          : ''} {hoveredIndex === i ? 'bg-[#e1ebfc] active:bg-[#c6d8f9]' : ''}"
        onclick={() => onitemclick?.(item)}
        onmouseenter={(e) => onitemhover?.(i, item, e)}
        onmouseleave={() => onitemleave?.(i)}
      >
        {#if item.image_path}
          <img
            class="size-4 shrink-0 {!item.enable ? 'opacity-40' : ''}"
            src={item.image_path}
            alt=""
          />
        {/if}
        <span class="flex-1">{item.text}</span>
        {#if item.check_image_path}
          <img
            class="ml-auto size-4 shrink-0 {!item.enable ? 'opacity-40' : ''}"
            src={item.check_image_path}
            alt=""
          />
        {:else if showSubmenuArrows && item.menu && item.children?.length}
          <img
            class="ml-auto size-4 shrink-0 opacity-50"
            src="gui://skin/menu/sub_icon.svg"
            alt=""
          />
        {/if}
      </div>
    {/if}
  {/each}
</div>
