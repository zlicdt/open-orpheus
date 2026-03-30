<script lang="ts">
  import type { HTMLButtonAttributes } from "svelte/elements";

  const {
    normal,
    hover,
    active,
    disabled,
    class: className,
    imgClass,
    ...rest
  }: Omit<HTMLButtonAttributes, "disabled"> & {
    normal: string;
    hover: string;
    active: string;
    disabled?: string;
    class?: string;
    imgClass?: string;
  } = $props();
</script>

<button class="group/icon-btn {className}" disabled={!!disabled} {...rest}>
  {#if disabled}
    <img src={disabled} alt="icon disabled" />
  {:else}
    <img
      src={normal}
      class="block group-hover/icon-btn:hidden group-active/icon-btn:hidden {imgClass}"
      alt="icon"
    />
    <img
      src={hover}
      class="hidden group-hover/icon-btn:block group-active/icon-btn:hidden {imgClass}"
      alt="icon hover"
    />
    <img
      src={active}
      class="hidden group-hover/icon-btn:hidden group-active/icon-btn:block {imgClass}"
      alt="icon active"
    />
  {/if}
</button>
