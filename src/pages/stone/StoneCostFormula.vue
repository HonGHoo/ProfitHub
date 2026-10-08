<script setup lang="ts">
import type { StoneSourceRow } from "@/calculator/alchemyChain"
import * as Format from "@@/utils/format"
import { useI18n } from "vue-i18n"
import { getItemDetailOf } from "@/common/apis/game"

defineProps<{ row: StoneSourceRow }>()
const { t } = useI18n()
const itemName = (hrid: string) => t(getItemDetailOf(hrid)?.name ?? hrid)
// 公式保留数字精度，不使用 K/M 缩写，避免中间结果看起来不相等。
const numberText = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 6 })
const sumText = (values: number[]) => values.length ? values.map(numberText).join(" + ") : "0"
</script>

<template>
  <div class="cost-formula">
    <strong>{{ t('完整计算过程') }}</strong>
    <template v-if="row.craftBreakdown && row.craftBreakdown.total >= 0">
      <div class="formula-heading">
        {{ t('制作材料成本') }}
      </div>
      <div v-for="(item, index) in row.craftBreakdown.items" :key="`${item.hrid}-${index}`">
        {{ itemName(item.hrid) }}：
        {{ numberText(item.baseCount) }}
        <template v-if="item.artisanApplied">
          × (1 − {{ Format.percent(row.craftBreakdown.artisanBuff, 4) }})
        </template>
        × {{ numberText(item.unitPrice) }} = {{ numberText(item.subtotal) }}
      </div>
      <div>{{ t('制作总成本') }}：{{ sumText(row.craftBreakdown.items.map(item => item.subtotal)) }} = {{ numberText(row.craftBreakdown.total) }}</div>
    </template>
    <template v-if="row.actionBreakdown && row.stonesPerAction > 0">
      <div class="formula-heading">
        {{ t(row.method === 'transmute' ? '转化' : '分解') }} · {{ t('单次期望投入') }}
      </div>
      <div>{{ t('装备计价') }}：{{ t(row.customBuyPrice ? '自定义价格' : row.useCraft ? '自制' : '市场价') }}</div>
      <div v-for="(item, index) in row.actionBreakdown.inputs" :key="`${item.hrid}-${index}`">
        {{ itemName(item.hrid) }}：{{ numberText(item.count) }} × {{ numberText(item.unitPrice) }} = {{ numberText(item.subtotal) }}
      </div>
      <div>{{ t('单次总投入') }}：{{ sumText(row.actionBreakdown.inputs.map(item => item.subtotal)) }} = {{ numberText(row.actionBreakdown.totalCost) }}</div>
      <div class="formula-heading">
        {{ t('期望产出与副产物抵扣') }}
      </div>
      <div>{{ t('成功率') }}：{{ Format.percent(row.actionBreakdown.successRate, 4) }} · {{ t('卖出到手比例') }}：{{ Format.percent(row.actionBreakdown.sellTaxFactor) }}</div>
      <div>{{ t('期望贤者数量') }}：{{ numberText(row.actionBreakdown.stoneCount) }} × {{ Format.percent(row.actionBreakdown.stoneDropRate, 4) }} × {{ Format.percent(row.actionBreakdown.successRate, 4) }} = {{ numberText(row.stonesPerAction) }}</div>
      <div v-for="(item, index) in row.actionBreakdown.byproducts" :key="`${item.hrid}-${index}`">
        {{ itemName(item.hrid) }}：{{ numberText(item.count) }} × {{ Format.percent(item.rate, 4) }} × {{ Format.percent(row.actionBreakdown.successRate, 4) }} = {{ numberText(item.expectedCount) }}；
        {{ numberText(item.expectedCount) }} × {{ numberText(item.unitPrice) }} × {{ Format.percent(item.taxFactor) }} = {{ numberText(item.subtotal) }}
      </div>
      <div>{{ t('副产物抵扣合计') }}：{{ sumText(row.actionBreakdown.byproducts.map(item => item.subtotal)) }} = {{ numberText(row.byproductIncome) }}</div>
      <div class="formula-heading">
        {{ t('贤者成本（单颗净成本）') }}
      </div>
      <div>{{ t('单颗净成本 =（单次总投入 − 副产物抵扣）÷ 期望贤者数量') }}</div>
      <strong class="formula-result">({{ numberText(row.actionBreakdown.totalCost) }} − {{ numberText(row.byproductIncome) }}) ÷ {{ numberText(row.stonesPerAction) }} = {{ numberText(row.costPerStone) }}</strong>
    </template>
    <div v-else>
      {{ t('缺少价格或有效产出，无法计算贤者单颗成本。') }}
    </div>
  </div>
</template>

<style scoped>
.cost-formula {
  padding: 10px 12px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 6px;
  background: var(--el-fill-color-light);
  font-size: 12px;
  line-height: 1.7;
  overflow-wrap: anywhere;
}

.formula-heading {
  margin-top: 10px;
  font-weight: 600;
}

.formula-result {
  display: block;
  color: var(--el-color-primary);
}
</style>
