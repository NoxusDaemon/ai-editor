<template>
  <UEditor v-model="prompt" class="my-2 rounded-xl border-2 border-solid" content-type="markdown" />
</template>

<script lang="ts" setup>

const prompt = defineModel<string>()

onMounted(() => prompt.value ||= ' ')
</script>
