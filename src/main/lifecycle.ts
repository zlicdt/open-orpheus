export let started = false;
export let quitting = false;

export function markStarted() {
  started = true;
}

export function markQuitting() {
  quitting = true;
}
