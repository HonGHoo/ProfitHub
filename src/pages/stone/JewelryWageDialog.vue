<script lang="ts" setup>
import ItemIcon from "@@/components/ItemIcon/index.vue"
import * as Format from "@@/utils/format"
import { calculateExpectedJewelryMaterialPrices, calculatePhilosopherJewelryWages, type ExpectedJewelryMaterialPrices, PHILOSOPHER_JEWELRY, type PhilosopherJewelryWageRow } from "@/calculator/philosopherJewelry"
import { clearEnhancelateCache, getItemDetailOf } from "@/common/apis/game"
import { runWithPlayerContext } from "@/common/apis/player"
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
const allRows = ref<PhilosopherJewelryWageRow[]>([])
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

const jewelryHrids = PHILOSOPHER_JEWELRY
const enhancingTool = computed(() => playerStore.config.actionConfigMap.get("enhancing")?.tool)

const rows = computed(() => allRows.value
  .filter((row) => {
    const type = getEquipmentTypeOf(getItemDetailOf(row.hrid))
    return row.enhanceLevel >= minLevel.value && row.enhanceLevel <= maxLevel.value
      && (jewelryType.value === "all" || type === jewelryType.value)
      && t(getItemDetailOf(row.hrid).name).toLocaleLowerCase().includes(search.value.toLocaleLowerCase())
  })
  .sort((a, b) => b.profitPH - a.profitPH))

async function calculate() {
  const version = ++calculationVersion
  const playerConfig = playerStore.config
  loading.value = true
  allRows.value = []
  completedItems.value = 0
  // 强化期望次数缓存不区分人物加成，切换全局装备后必须重新求解。
  clearEnhancelateCache()
  prices.value = runWithPlayerContext(playerConfig, calculateExpectedJewelryMaterialPrices)
  if (!prices.value) {
    loading.value = false
    return
  }
  await new Promise(resolve => setTimeout(resolve, 0))
  if (version !== calculationVersion) return
  try {
    for (const hrid of jewelryHrids) {
      if (version !== calculationVersion) break
      const result = runWithPlayerContext(playerConfig, () => calculatePhilosopherJewelryWages(hrid, prices.value!))
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
    <div class="flex flex-wrap gap-3 mb-3">
      <span>{{ t('当前预设') }}：{{ playerStore.config.name || playerStore.presetIndex + 1 }}</span>
      <span>{{ t('强化器') }}：{{ enhancingTool?.hrid ? `${t(getItemDetailOf(enhancingTool.hrid)?.name ?? enhancingTool.hrid)} +${enhancingTool.enhanceLevel || 0}` : t('未装备') }}</span>
    </div>
    <template v-if="prices">
      <el-alert :title="t('贤者碎按自制期望成本计价；一次贤者石转化的成本按星碎、太阳石、保护镜的期望市值分摊。全部低级首饰自行制作。工时包含两层首饰制作与强化，不含贤者石加工时间。')" type="info" :closable="false" class="mb-3" />
      <div class="flex flex-wrap gap-3 mb-4">
        <div>{{ t('贤者之石右收价') }}：{{ Format.money(prices.stoneBid) }}</div>
        <div>{{ t('贤者碎期望单价') }}：{{ Format.money(prices.crushedStone) }} <small>(÷ {{ Format.number(prices.crushedYield, 2) }})</small></div>
        <div>{{ t('星碎分摊单价') }}：{{ Format.money(prices.starFragment) }}</div>
        <div>{{ t('太阳石分摊单价') }}：{{ Format.money(prices.sunstone) }}</div>
        <div>{{ t('保护镜分摊单价') }}：{{ Format.money(prices.protectionMirror) }}</div>
      </div>
    </template>
    <el-alert v-else :title="t('贤者之石缺少右收价或制作、转化原料缺价')" type="warning" :closable="false" class="mb-3" />

    <div class="flex flex-wrap items-center gap-2 mb-3">
      <el-input v-model="search" :placeholder="t('搜索首饰')" clearable style="width: 180px" />
      <el-select v-model="jewelryType" style="width: 120px">
        <el-option :label="t('全部贤者首饰')" value="all" />
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
      <el-table-column type="expand" width="48">
        <template #default="{ row }">
          <div class="p-3">
            <strong>{{ t('低级首饰自制明细') }}</strong>
            <el-table :data="row.lowJewelry" size="small" class="mt-2 mb-2">
              <el-table-column :label="t('物品')" min-width="180">
                <template #default="{ row: low }">
                  <div class="flex items-center gap-2">
                    <ItemIcon :hrid="low.hrid" />
                    <span>{{ t(getItemDetailOf(low.hrid).name) }}</span>
                  </div>
                </template>
              </el-table-column>
              <el-table-column :label="t('期望用量')" min-width="110" align="right">
                <template #default="{ row: low }">
                  {{ Format.number(low.requiredCount, 4) }}
                </template>
              </el-table-column>
              <el-table-column :label="t('自制单价')" min-width="125" align="right">
                <template #default="{ row: low }">
                  {{ Format.money(low.unitCost) }}
                </template>
              </el-table-column>
              <el-table-column :label="t('成本')" min-width="125" align="right">
                <template #default="{ row: low }">
                  {{ Format.money(low.totalCost) }}
                </template>
              </el-table-column>
              <el-table-column :label="t('制作耗时')" min-width="125" align="right">
                <template #default="{ row: low }">
                  {{ Format.costTime(low.hours * 3600 * 1e9) }}
                </template>
              </el-table-column>
            </el-table>
            <div class="flex flex-wrap gap-4">
              <span>{{ t('贤者首饰制作成本') }}：{{ Format.money(row.craftedCost) }}</span>
              <span>{{ t('强化期望消耗') }}：{{ Format.money(row.costPerItem - row.craftedCost) }}</span>
              <span>{{ t('成品期望总成本') }}：{{ Format.money(row.costPerItem) }}</span>
              <span>{{ t('成品税后期望收入') }}：{{ Format.money(row.incomePerItem) }}</span>
              <span>{{ t('成品期望盈亏') }}：<span :class="row.incomePerItem >= row.costPerItem ? 'color-green-500' : 'color-red-500'">{{ Format.money(row.incomePerItem - row.costPerItem) }}</span></span>
              <span>{{ t('全部制作时间') }}：{{ Format.costTime(row.craftHours * 3600 * 1e9) }}</span>
              <span>{{ t('强化期望次数') }}：{{ Format.number(row.actions, 4) }}</span>
            </div>
          </div>
        </template>
      </el-table-column>
      <el-table-column :label="t('首饰')" min-width="180">
        <template #default="{ row }">
          <div class="flex items-center gap-2">
            <ItemIcon :hrid="row.hrid" />
            <span>{{ t(getItemDetailOf(row.hrid).name) }}</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column :label="t('等级')" width="75" align="right">
        <template #default="{ row }">
          +{{ row.enhanceLevel }}
        </template>
      </el-table-column>
      <el-table-column :label="t('保护')" width="90" align="right">
        <template #default="{ row }">
          +{{ row.protectLevel }}
        </template>
      </el-table-column>
      <el-table-column :label="t('工时费/h')" min-width="135" align="right">
        <template #default="{ row }">
          <span :class="row.profitPH >= 0 ? 'color-green-500' : 'color-red-500'">{{ Format.money(row.profitPH) }}</span>
        </template>
      </el-table-column>
      <el-table-column :label="t('成本/h')" min-width="125" align="right">
        <template #default="{ row }">
          {{ Format.money(row.costPH) }}
        </template>
      </el-table-column>
      <el-table-column :label="t('收入/h')" min-width="125" align="right">
        <template #default="{ row }">
          {{ Format.money(row.incomePH) }}
        </template>
      </el-table-column>
      <template #empty>
        {{ prices ? t('当前筛选下没有可计算的首饰方案') : t('暂无数据') }}
      </template>
    </el-table>
  </el-dialog>
</template>
