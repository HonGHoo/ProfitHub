<template>
  <span class="polokiki-badge">
    <span class="polokiki-icon-chip">
      <svg viewBox="0 0 40 40" aria-hidden="true">
        <path
          d="M32.37 15.877c-1.395.063-3.875-.514-4.488-.868l3.001-4.681c.365.333 1.619 1.754 2.76 2.262 1.427.635 3.328.55 2.754 1.355-.752 1.055-2.631 1.87-4.027 1.932Z"
          fill="#FAA21E"
        />
        <path
          d="M16.621 11.515c-1.039-3.892.239-4.232 1.295-5.271l3.127 2.119c.508 1.086.916 2.864 3.688 6.455 3.31 4.29 7.715 3.698 10.57 8.556 2.357 4.013 1.45 8.487-4.045 11.954-5.494 3.467-12.232 4.4-18.033 2.244-4.641-1.725-8.867-7.977-10.29-11.148.913.297 2.867.967 4.027-.633 1.45-2 5.246-5.016 9.849-5.744 3.682-.583 7.444.665 9.882 2.087-2.294-1.46-8.283-3.926-10.07-10.62Z"
          fill="#FEFEFE"
        />
        <path
          fill-rule="evenodd"
          clip-rule="evenodd"
          d="M17.71 13.144c-1.668-2.16-2.052-5.73-.308-8.268C18.865 2.747 21.134 1.21 24.43.93c4.66-.397 7.768 2.358 8.778 4.606 1.01 2.248 1.911 6.15-2.428 8.697-4.34 2.547-11.02.9-13.07-1.089Zm9.266-1.516a2 2 0 1 0-1.035-3.863 2 2 0 0 0 1.035 3.863Z"
          fill="#FEFEFE"
        />
        <path
          d="M23.778 25.382c-4.746-2.592-7.505-1.823-8.753-1.62-1.561.253-4.218 1.647-4.196 2.764.017.895 2.673 3.304 3.65 3.732-.365.38-1.468.431-1.096 1.14.464.885 2.468.4 4.239-.53"
          stroke="#FAA21E"
          stroke-linecap="round"
        />
      </svg>
    </span>
    <span class="polokiki-name">polokiki</span>
  </span>
</template>

<style scoped>
/* 复刻游戏内聊天名牌：duckling 图标（chat_icons_sprite）垫 --color-background-game 深色圆角底，
   名字色 = 游戏 CharacterName 渐变绿（--color-jade-100/200/300 实测值取自游戏 CSS） */
.polokiki-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-left: 10px;
  vertical-align: middle;
}

.polokiki-icon-chip {
  display: inline-flex;
  padding: 3px;
  border-radius: 4px;
  background: #131419;
}

.polokiki-icon-chip svg {
  display: block;
  width: 16px;
  height: 16px;
}

.polokiki-name {
  background: linear-gradient(90deg, #82dcca, #82dcca 3%, #d5f3ed 15%, #d5f3ed 30%, #ace7dc 50%, #82dcca 95%, #82dcca);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  font-weight: 600;
  font-size: 16px;
}
</style>
