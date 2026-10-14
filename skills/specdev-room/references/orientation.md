# 开始写候选前：朝向与依附短例

先读同包真实模板和每件资产元数据，下面只解释坐标，不保证任意家具或位置通过。

资产正面为本地 +Z；floor 的 yawDeg=90 将正面转到世界 +X。只用资产允许的 0/90/180/270，完整实体、操作空间与站位一起旋转。

```json
{ "instanceId": "desk", "assetId": "fairy-desk-01",
  "placement": { "kind": "floor", "zoneId": "floor-main", "x": -1, "z": 0.4, "yawDeg": 90 } }
```

台灯依附桌面，offsetX/offsetZ 是桌面中心的局部偏移，yawDeg 相对父家具；此例世界朝向为90。桌子移动或旋转，不把灯改成世界坐标，不改父引用、承载面、身份和绑定。实际范围与类别从该桌 surfaces 读取。

```json
{ "instanceId": "lamp", "assetId": "fairy-table-lamp-01",
  "placement": { "kind": "surface", "parentInstanceId": "desk", "surfaceId": "desktop", "offsetX": -0.4, "offsetZ": 0, "yawDeg": 0 } }
```

候选必须是完整room.json对象，不能只传这两个片段。入口/fixture、完整人物和10cm墙边区域不能缩小；corridor不再是硬限制。最终位置调用公开试摆，选定写回后运行完整check-room。
