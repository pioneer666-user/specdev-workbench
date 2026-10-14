// 底座与声音共用的固定运行时地面描述；不进入 room.json 或可编辑模板协议。
export const ROOM_FLOOR_SURFACES = Object.freeze({
  ceramic: Object.freeze({ interior: 'tile' }),
  fairy: Object.freeze({
    interior: 'wood',
    threshold: Object.freeze({ surface: 'stone', width: 1.7, height: .14, depth: .78, x: 2.25, y: -.066, z: -3.4 }),
  }),
})
