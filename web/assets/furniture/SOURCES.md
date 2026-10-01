# 家具来源与许可

十二款登记家具均由本项目程序化自制；模型代码、程序生成纹理与渲染缩略图统一采用同包 [MIT许可证](../../../LICENSE)。没有引入外部模型或网络素材。木纹/织物由固定种子DataTexture生成，其余使用材质着色；缩略图由相应模型渲染生成。

asset.json 的 source.license 为 MIT。status=internal 是当前目录格式的登记字段，目录读取器仍要求此值；它不是许可限制，不需要修改为public/published。尺寸、互动、摆放与绑定约束以每款asset.json为准。

| 家具 | 元数据 | 模型 | 缩略图 |
| --- | --- | --- |
| 暖釉陶瓷展示台 | [ceramic-display-stand-01](assets/ceramic-display-stand-01/asset.json) | [model.js](assets/ceramic-display-stand-01/model.js) | [preview.webp](assets/ceramic-display-stand-01/preview.webp) |
| 暖釉落地阅读灯 | [ceramic-floor-lamp-01](assets/ceramic-floor-lamp-01/asset.json) | [model.js](assets/ceramic-floor-lamp-01/model.js) | [preview.webp](assets/ceramic-floor-lamp-01/preview.webp) |
| 暖白双门矮柜 | [ceramic-low-cabinet-01](assets/ceramic-low-cabinet-01/asset.json) | [model.js](assets/ceramic-low-cabinet-01/model.js) | [preview.webp](assets/ceramic-low-cabinet-01/preview.webp) |
| 暖釉细颈花瓶 | [ceramic-vase-01](assets/ceramic-vase-01/asset.json) | [model.js](assets/ceramic-vase-01/model.js) | [preview.webp](assets/ceramic-vase-01/preview.webp) |
| 林间蜂蜜木床 | [fairy-bed-01](assets/fairy-bed-01/asset.json) | [model.js](assets/fairy-bed-01/model.js) | [preview.webp](assets/fairy-bed-01/preview.webp) |
| 林间双册书摆 | [fairy-book-stack-01](assets/fairy-book-stack-01/asset.json) | [model.js](assets/fairy-book-stack-01/model.js) | [preview.webp](assets/fairy-book-stack-01/preview.webp) |
| 林间蜂蜜木书架 | [fairy-bookshelf-01](assets/fairy-bookshelf-01/asset.json) | [model.js](assets/fairy-bookshelf-01/model.js) | [preview.webp](assets/fairy-bookshelf-01/preview.webp) |
| 林间蜂蜜木书桌 | [fairy-desk-01](assets/fairy-desk-01/asset.json) | [model.js](assets/fairy-desk-01/model.js) | [preview.webp](assets/fairy-desk-01/preview.webp) |
| 林间蜂蜜木告示牌 | [fairy-notice-board-01](assets/fairy-notice-board-01/asset.json) | [model.js](assets/fairy-notice-board-01/model.js) | [preview.webp](assets/fairy-notice-board-01/preview.webp) |
| 林间小叶盆栽 | [fairy-potted-plant-01](assets/fairy-potted-plant-01/asset.json) | [model.js](assets/fairy-potted-plant-01/model.js) | [preview.webp](assets/fairy-potted-plant-01/preview.webp) |
| 林间软垫阅读椅 | [fairy-reading-chair-01](assets/fairy-reading-chair-01/asset.json) | [model.js](assets/fairy-reading-chair-01/model.js) | [preview.webp](assets/fairy-reading-chair-01/preview.webp) |
| 林间暖光台灯 | [fairy-table-lamp-01](assets/fairy-table-lamp-01/asset.json) | [model.js](assets/fairy-table-lamp-01/model.js) | [preview.webp](assets/fairy-table-lamp-01/preview.webp) |

## 第三方依赖

Three.js用于渲染，随包代码保留上游MIT版权声明，来源与版本见 [Three.js版本说明](../three/VERSION.md)。Archify用于资料和流程图渲染，其 [LICENSE](../../../vendor/archify-renderer/archify/LICENSE) 与 [第三方声明](../../../vendor/archify-renderer/archify/THIRD_PARTY_NOTICES.md) 保留。家具MIT声明不替换任何第三方版权。
