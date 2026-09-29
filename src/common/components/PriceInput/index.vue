<script setup lang="ts">
import { formatPriceInput, parsePriceInput } from "@/common/utils/priceInput"

const props = withDefaults(defineProps<{
  modelValue?: number
  min?: number
  max?: number
  disabled?: boolean
  placeholder?: string
  controls?: boolean
  step?: number
}>(), { min: 0, max: Number.MAX_SAFE_INTEGER, disabled: false, placeholder: "", controls: false, step: 1 })
const emit = defineEmits<{ "update:modelValue": [value: number | undefined], "change": [value: number | undefined, oldValue: number | undefined] }>()
function display(value: number | undefined) {
  return value === -1 && props.min <= -1 ? "-1" : formatPriceInput(value ?? -1)
}
const text = ref(display(props.modelValue))
watch(() => props.modelValue, value => text.value = display(value))

function commit() {
  const value = text.value.trim() ? (text.value.trim() === "-1" && props.min <= -1 ? -1 : parsePriceInput(text.value)) : undefined
  if (value === undefined || (value !== null && value >= props.min && value <= props.max)) {
    emit("update:modelValue", value)
    emit("change", value, props.modelValue)
    text.value = display(value)
  } else {
    text.value = display(props.modelValue)
  }
}

function stepPrice(direction: number) {
  const value = Math.min(props.max, Math.max(props.min, (props.modelValue ?? 0) + direction * props.step))
  emit("update:modelValue", value)
  emit("change", value, props.modelValue)
  text.value = display(value)
}
</script>

<template>
  <el-input v-model="text" :disabled="disabled" :placeholder="placeholder" inputmode="decimal" @blur="commit" @keyup.enter="commit">
    <template v-if="controls" #append>
      <span class="price-input-controls">
        <button type="button" :disabled="disabled" @click="stepPrice(1)">+</button>
        <button type="button" :disabled="disabled" @click="stepPrice(-1)">−</button>
      </span>
    </template>
  </el-input>
</template>

<style scoped>
.price-input-controls {
  display: inline-flex;
  flex-direction: column;
}
.price-input-controls button {
  border: 0;
  background: transparent;
  cursor: pointer;
  line-height: 12px;
}
</style>
