<script lang="ts" setup>
import { priceStepOf } from "@/common/apis/game"
import { formatPriceInput, parsePriceInput } from "@/common/utils/priceInput"

const props = withDefaults(defineProps<{
  modelValue?: number
  min?: number
  max?: number
  placeholder?: string
  fallbackBase: number
  disabled?: boolean
  width?: string
}>(), {
  modelValue: undefined,
  min: 0,
  max: 5000000000,
  placeholder: "",
  disabled: false,
  width: "120px"
})

const emit = defineEmits<{
  "update:modelValue": [value: number | undefined]
  "change": [value: number | undefined, oldValue: number | undefined]
}>()

function clamp(value: number) {
  return Math.min(props.max, Math.max(props.min, value))
}

function emitValue(value: number | undefined, oldValue: number | undefined) {
  emit("update:modelValue", value)
  emit("change", value, oldValue)
}

function resolveTierStep(value: number | undefined, oldValue: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return value
  }

  if (value < props.min) {
    return props.min
  }

  const isOldNumber = typeof oldValue === "number" && Number.isFinite(oldValue)
  const delta = isOldNumber ? value - oldValue : Number.NaN

  let high: boolean | undefined
  let base: number | undefined

  if (isOldNumber && oldValue === -1 && value === 0) {
    return 1
  } else if (isOldNumber && Math.abs(Math.abs(delta) - 1) < 1e-9) {
    high = delta > 0
    base = oldValue
  } else if (!isOldNumber && (value === -1 || value === 0 || value === 1)) {
    if (props.fallbackBase > 0) {
      high = value === 1
      base = props.fallbackBase
    } else {
      return value === 1 ? 1 : props.min
    }
  } else {
    return clamp(value)
  }

  const next = priceStepOf(base, high)
  return clamp(next > 0 ? next : props.min)
}

function display(value: number | undefined) {
  return value === -1 && props.min <= -1 ? "-1" : formatPriceInput(value ?? -1)
}
const inputText = ref(display(props.modelValue))
watch(() => props.modelValue, value => inputText.value = display(value))

function commitText() {
  if (!inputText.value.trim()) {
    emitValue(undefined, props.modelValue)
    return
  }
  const value = inputText.value.trim() === "-1" && props.min <= -1 ? -1 : parsePriceInput(inputText.value)
  if (value !== null && value >= props.min && value <= props.max) emitValue(value, props.modelValue)
  inputText.value = display(props.modelValue)
}

function step(high: boolean) {
  const oldValue = props.modelValue
  const next = resolveTierStep((oldValue ?? (high ? 0 : 1)) + (high ? 1 : -1), oldValue)
  emitValue(next, oldValue)
  inputText.value = display(next)
}
</script>

<template>
  <div class="tiered-price-input" :style="{ width }">
    <el-input
      class="tiered-price-input__input"
      v-model="inputText"
      :disabled="disabled"
      :placeholder="placeholder"
      inputmode="decimal"
      @blur="commitText"
      @keyup.enter="commitText"
    >
      <template #append>
        <div class="tiered-price-input__buttons">
          <button type="button" :disabled="disabled" @click="step(true)">
            +
          </button>
          <button type="button" :disabled="disabled" @click="step(false)">
            −
          </button>
        </div>
      </template>
    </el-input>
  </div>
</template>

<style scoped>
.tiered-price-input {
  display: block;
}

.tiered-price-input__input {
  width: 100%;
}

.tiered-price-input__buttons {
  display: flex;
  flex-direction: column;
}

.tiered-price-input__buttons button {
  border: 0;
  background: transparent;
  cursor: pointer;
  line-height: 12px;
}
</style>
