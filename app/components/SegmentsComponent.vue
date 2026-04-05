<template>
    <div class="flex flex-wrap mt-1" @click="editing = -1">
        <span class="flex  mr-1 rounded-xl border-2 border-solid" v-for="(segment, i) in segments" :key="'segment-' + i"
            @dblclick="editing = i; editingValue = segment">
            <div v-if="editing !== i" class="p-1">
                {{ segment }}
            </div>
            <UInput class="flex" v-else variant="none" v-model="editingValue" @click.stop />
        </span>
        <span class="flex mt-0.5">
            <UButton icon="i-lucide-plus" color="warning" @click="addNew" />
        </span>
    </div>
</template>

<script setup>
const segments = defineModel()
const editing = ref(-1)
const editingValue = ref('')

watch(editing, (newEditingValue, oldEditingValue) => {
    if (oldEditingValue === -1) return
    if (editingValue.value === '') {
        segments.value.splice(oldEditingValue, 1)
        return
    } else {
        segments.value[oldEditingValue] = editingValue.value
        return
    }
})

function addNew() {
    segments.value.push("NewItem")
}
</script>
