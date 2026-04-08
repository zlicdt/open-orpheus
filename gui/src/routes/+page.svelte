<script lang="ts" module>
</script>

<script lang="ts">
  import * as Sidebar from "$lib/components/ui/sidebar";
  import Logo from "../../../assets/icon.svg";

  import PackageIcon from "@lucide/svelte/icons/package";
  import Package from "./Package.svelte";

  import Database from "@lucide/svelte/icons/database";
  import Cache from "./Cache.svelte";

  const items = [
    {
      id: "package",
      name: "资源包",
      icon: PackageIcon,
      component: Package,
    },
    {
      id: "cache",
      name: "缓存",
      icon: Database,
      component: Cache,
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
            {#each items as item}
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
  <main class="h-screen overflow-y-auto p-4">
    {#each items as item, i}
      <div class="my-4" class:mt-0={i === 0} id={item.id}>
        <item.component />
      </div>
    {/each}
  </main>
</Sidebar.Provider>
