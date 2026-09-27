<script lang="ts" setup>
import type Calculator from "@/calculator"
import ItemIcon from "@@/components/ItemIcon/index.vue"
import * as Format from "@@/utils/format"
import { calculateExpectedJewelryMaterialPrices, CRUSHED_STONE, type ExpectedJewelryMaterialPrices, PHILOSOPHER_STONE, PROTECTION_MIRROR, STAR_FRAGMENT } from "@/calculator/philosopherJewelry"
import { getGameDataApi } from "@/common/apis/game"
import { calcEnhanceProfit } from "@/common/apis/jungle"
import { getEquipmentTypeOf } from "@/common/utils/game"
import { useGameStore } from "@/pinia/stores/game"
import { usePlayerStore } from "@/pinia/stores/player"

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ "update:modelValue": [value: boolean] }>()
const { t } = useI18n()
const gameStore = useGameStore()
const playerStore = usePlayerStore()

const loading = ref(false)
const prices = ref<ExpectedJewelryMaterialPrices | null>(null)
const allRows = ref<Calculator[]>([])
const completedItems = ref(0)
const search = ref("")
const minLevel = ref(1)
const maxLevel = ref(20)
const jewelryType = ref("all")
let calculationVersion = 0

const dialogVisible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit("update:modelValue", value)
})

const jewelryHrids = computed(() => Object.values(getGameDataApi().itemDetailMap)
  .filter(item => item.enhancementCosts && ["ring", "earrings", "neck"].includes(getEquipmentTypeOf(item)))
  .map(item => item.hrid))

const rows = computed(() => allRows.value
  .filter((row) => {
    const level = row.calculator.enhanceLevel
    const type = getEquipmentTypeOf(row.calculator.item)
    return level >= minLevel.value && level <= maxLevel.value
      && (jewelryType.value === "all" || type === jewelryType.value)
      && t(row.calculator.item.name).toLocaleLowerCase().includes(search.value.toLocaleLowerCase())
  })
  .sort((a, b) => b.result.profitPH - a.result.profitPH))

async function calculate() {
  const version = ++calculationVersion
  loading.value = true
  allRows.value = []
  completedItems.value = 0
  prices.value = calculateExpectedJewelryMaterialPrices()
  if (!prices.value) {
    loading.value = false
    return
  }
  await new Promise(resolve => setTimeout(resolve, 0))
  if (version !== calculationVersion) return
  try {
    const overrides = {
      [PHILOSOPHER_STONE]: prices.value.stoneBid,
      [CRUSHED_STONE]: prices.value.crushedStone,
      [STAR_FRAGMENT]: prices.value.starFragment,
      [PROTECTION_MIRROR]: prices.value.protectionMirror
    }
    for (const hrid of jewelryHrids.value) {
      if (version !== calculationVersion) break
      const result = await calcEnhanceProfit({
        itemHrids: [hrid],
        ingredientPriceOverrides: overrides
      })
      if (version !== calculationVersion) break
      allRows.value.push(...result)
      completedItems.value++
      // 每件首饰完成后让浏览器绘制已算出的行和进度状态。
      await new Promise(resolve => setTimeout(resolve, 0))
    }
  } finally {
    if (version === calculationVersion) loading.value = false
  }
}

watch(() => props.modelValue, (visible) => {
  if (visible) calculate()
  else calculationVersion++
})
watch([
  () => gameStore.marketData,
  () => gameStore.buyStatus,
  () => gameStore.sellStatus,
  () => playerStore.configVersion
], () => {
  if (props.modelValue) calculate()
})
</script>

<template>
  <el-dialog v-model="dialogVisible" :title="t('首饰工时')" width="min(1200px, 95vw)" destroy-on-close>
    <template v-if="prices">
      <el-alert :title="t('以贤者之石右收价为起点：制作贤者碎、转化星碎和保护镜，分别用完整投入除以该产物期望数量定价。下表沿用打野页的制作与强化收益算法；首饰制作时间计入工时，贤者石的制作与转化时间不计入。')" type="info" :closable="false" class="mb-3" />
      <div class="flex flex-wrap gap-3 mb-4">
        <div>{{ t('贤者之石右收价') }}：{{ Format.money(prices.stoneBid) }}</div>
        <div>{{ t('贤者碎期望单价') }}：{{ Format.money(prices.crushedStone) }} <small>(÷ {{ Format.number(prices.crushedYield, 2) }})</small></div>
        <div>{{ t('星碎期望单价') }}：{{ Format.money(prices.starFragment) }} <small>(÷ {{ Format.number(prices.starYield, 2) }})</small></div>
        <div>{{ t('保护镜期望单价') }}：{{ Format.money(prices.protectionMirror) }} <small>(÷ {{ Format.number(prices.mirrorYield, 2) }})</small></div>
      </div>
    </template>
    <el-alert v-else :title="t('贤者之石缺少右收价或制作、转化原料缺价')" type="warning" :closable="false" class="mb-3" />

    <div class="flex flex-wrap items-center gap-2 mb-3">
      <el-input v-model="search" :placeholder="t('搜索首饰')" clearable style="width: 180px" />
      <el-select v-model="jewelryType" style="width: 120px">
        <el-option :label="t('全部首饰')" value="all" />
        <el-option :label="t('戒指')" value="ring" />
        <el-option :label="t('耳环')" value="earrings" />
        <el-option :label="t('项链')" value="neck" />
      </el-select>
      <span>{{ t('强化等级') }}</span>
      <el-input-number v-model="minLevel" :min="1" :max="maxLevel" controls-position="right" style="width: 90px" />
      <span>–</span>
      <el-input-number v-model="maxLevel" :min="minLevel" :max="20" controls-position="right" style="width: 90px" />
      <el-button :loading="loading" @click="calculate">
        {{ t('重新计算') }}
      </el-button>
      <span v-if="loading">{{ completedItems }}/{{ jewelryHrids.length }}</span>
    </div>

    <el-table :data="rows" height="min(60vh, 600px)" border>
      <el-table-column :label="t('首饰')" min-width="180">
        <template #default="{ row }">
          <div class="flex items-center gap-2">
            <ItemIcon :hrid="row.calculator.hrid" />
            <span>{{ t(row.calculator.item.name) }}</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column :label="t('等级')" width="75" align="right">
        <template #default="{ row }">
          +{{ row.calculator.enhanceLevel }}
        </template>
      </el-table-column>
      <el-table-column :label="t('方案')" min-width="170">
        <template #default="{ row }">
          {{ row.project }}
        </template>
      </el-table-column>
      <el-table-column :label="t('保护')" width="90" align="right">
        <template #default="{ row }">
          +{{ row.calculator.protectLevel }}
        </template>
      </el-table-column>
      <el-table-column :label="t('工时费/h')" min-width="135" align="right">
        <template #default="{ row }">
          <span :class="row.result.profitPH >= 0 ? 'color-green-500' : 'color-red-500'">{{ Format.money(row.result.profitPH) }}</span>
        </template>
      </el-table-column>
      <el-table-column :label="t('成本/h')" min-width="125" align="right">
        <template #default="{ row }">
          {{ Format.money(row.result.costPH) }}
        </template>
      </el-table-column>
      <el-table-column :label="t('收入/h')" min-width="125" align="right">
        <template #default="{ row }">
          {{ Format.money(row.result.incomePH) }}
        </template>
      </el-table-column>
      <template #empty>
        {{ prices ? t('当前筛选下没有可计算的首饰方案') : t('暂无数据') }}
      </template>
    </el-table>
  </el-dialog>
</template>
