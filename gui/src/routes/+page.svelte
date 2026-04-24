<script lang="ts" module>
</script>

<script lang="ts">
  import * as Sidebar from "$lib/components/ui/sidebar";
  import Logo from "../../../assets/icon.svg";

  import PackageIcon from "@lucide/svelte/icons/package";
  import Package from "./Package.svelte";

  import Database from "@lucide/svelte/icons/database";
  import LocalResources from "./LocalResources.svelte";

  import AppWindow from "@lucide/svelte/icons/app-window";
  import Window from "./Window.svelte";

  import TableOfContents from "@lucide/svelte/icons/table-of-contents";
  import Tray from "./Tray.svelte";

  import Bug from "@lucide/svelte/icons/bug";
  import Debug from "./Debug.svelte";

  const items = [
    {
      id: "package",
      name: "资源包",
      icon: PackageIcon,
      component: Package,
    },
    {
      id: "local-resources",
      name: "本地资源",
      icon: Database,
      component: LocalResources,
    },
    {
      id: "window",
      name: "窗口设置",
      icon: AppWindow,
      component: Window,
    },
    {
      id: "tray",
      name: "托盘菜单",
      icon: TableOfContents,
      component: Tray,
    },
    {
      id: "debug",
      name: "调试",
      icon: Bug,
      component: Debug,
    },
  ];
</script>

<Sidebar.Provider>
  <Sidebar.Root
    collapsible="none"
    class="h-screen min-w-64 border-r-2 border-gray-200/50"
  >
    <Sidebar.Header
      class="grid grid-cols-[auto_1fr] grid-rows-[auto_auto] gap-0"
    >
      <img
        src={Logo}
        alt="Logo"
        class="row-span-2 mr-2 h-10 w-10 self-center"
      />
      <h1 class="text-xl font-bold">Open Orpheus</h1>
      <p class="text-xs opacity-75">v{__APP_VERSION__}</p>
    </Sidebar.Header>
    <Sidebar.Content>
      <Sidebar.Group>
        <Sidebar.GroupContent>
          <Sidebar.Menu>
            {#each items as item (item.id)}
              <Sidebar.MenuItem>
                <Sidebar.MenuButton>
                  {#snippet child({ props })}
                    <a href="#{item.id}" {...props}><item.icon />{item.name}</a>
                  {/snippet}
                </Sidebar.MenuButton>
              </Sidebar.MenuItem>
            {/each}
          </Sidebar.Menu>
        </Sidebar.GroupContent>
      </Sidebar.Group>
    </Sidebar.Content>
  </Sidebar.Root>
  <main class="h-screen flex-1 overflow-y-auto">
    <div class="w-full p-4 xl:mx-auto xl:w-4xl">
      {#each items as item, i (item.id)}
        <div class="my-4" class:mt-0={i === 0} id={item.id}>
          <item.component />
        </div>
        {#if i < items.length - 1}
          <hr class="my-6 border-t-2 border-gray-200/50" />
        {/if}
      {/each}
    </div>
  </main>
</Sidebar.Provider>
