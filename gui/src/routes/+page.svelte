<script lang="ts" module>
  declare const orpheus: {
    getWebPackCommitHash: () => Promise<string>;
  };
</script>

<script lang="ts">
  import * as Sidebar from "$lib/components/ui/sidebar";
  import Logo from "../../../assets/icon.svg";

  import Package from "@lucide/svelte/icons/package";

  import versions from "../../../versions.json";
  import { Button } from "$lib/components/ui/button";
</script>

<Sidebar.Provider>
  <Sidebar.Root>
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
            <Sidebar.MenuItem>
              <Sidebar.MenuButton>
                {#snippet child({ props })}
                  <a href="#package" {...props}><Package />资源包</a>
                {/snippet}
              </Sidebar.MenuButton>
            </Sidebar.MenuItem>
          </Sidebar.Menu>
        </Sidebar.GroupContent>
      </Sidebar.Group>
    </Sidebar.Content>
  </Sidebar.Root>
  <main class="p-4">
    <h1 class="text-2xl font-bold" id="package">资源包</h1>
    <p class="mt-2 text-gray-700">
      一个 Open Orpheus 版本仅为一个特定的资源包版本设计，因此推荐使用与当前
      Open Orpheus 版本匹配的资源包版本以获得最佳体验。
    </p>
    <p class="mt-4 text-gray-700">
      {#await orpheus.getWebPackCommitHash()}
        推荐资源包版本：{versions.commit}
      {:then commitHash}
        当前资源包版本：{commitHash}{#if commitHash === versions.commit}（已是推荐版本）{:else}（推荐使用
          {versions.commit}）{/if}
      {/await}
    </p>
    <!-- TODO: redownload -->
    <Button class="mt-4" disabled>重新下载资源包</Button>
  </main>
</Sidebar.Provider>
