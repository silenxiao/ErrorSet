import { CheckOutlined, DownOutlined } from "@ant-design/icons";
import { Button, Dropdown, Space, Tag, message, type MenuProps } from "antd";
import { useCallback, useEffect, useState } from "react";

import { enableModel, listModels, type ModelProfile } from "../../api/settings";
import SettingsModal from "../SettingsModal";

/** 模型列表变化的自定义事件：让页面上所有 ModelSelector 实例同步刷新。 */
export const MODELS_CHANGED_EVENT = "errorset-models-changed";

/** 识别模型选择下拉：点击切换即独占启用（识别时使用），供上传页/识别页复用。 */
export default function ModelSelector() {
  const [models, setModels] = useState<ModelProfile[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const reloadModels = useCallback(async () => {
    try {
      setModels(await listModels());
    } catch {
      // 模型列表加载失败不阻塞主流程
    }
  }, []);

  useEffect(() => {
    void reloadModels();
    // 其他实例切换/管理模型后，以及窗口重新聚焦时同步一次
    const sync = () => void reloadModels();
    window.addEventListener(MODELS_CHANGED_EVENT, sync);
    window.addEventListener("focus", sync);
    return () => {
      window.removeEventListener(MODELS_CHANGED_EVENT, sync);
      window.removeEventListener("focus", sync);
    };
  }, [reloadModels]);

  const handleModelMenu: MenuProps["onClick"] = async ({ key }) => {
    if (key === "manage") {
      setSettingsOpen(true);
      return;
    }
    try {
      await enableModel(Number(key));
      message.success("已切换识别模型");
      window.dispatchEvent(new Event(MODELS_CHANGED_EVENT));
      void reloadModels();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "切换模型失败");
    }
  };

  const modelMenu: MenuProps = {
    items: [
      ...models.map((m) => ({
        key: String(m.id),
        label: (
          <Space>
            <span>{m.name || m.model}</span>
            {m.scope === "system" && (
              <Tag color="blue" style={{ marginInlineEnd: 0 }}>
                系统
              </Tag>
            )}
            {m.enabled && <CheckOutlined />}
          </Space>
        ),
      })),
      ...(models.length > 0 ? [{ type: "divider" as const }] : []),
      { key: "manage", label: "管理模型" },
    ],
    onClick: handleModelMenu,
  };

  const enabledModel = models.find((m) => m.enabled);

  return (
    <>
      <Dropdown
        menu={modelMenu}
        trigger={["click"]}
        placement="topLeft"
        onOpenChange={(open) => {
          // 每次展开时刷新，保证与页面上其他模型选择器状态一致
          if (open) void reloadModels();
        }}
      >
        <Button>
          {enabledModel ? enabledModel.name || enabledModel.model : "选择模型"}
          <DownOutlined style={{ fontSize: 11, marginLeft: 4 }} />
        </Button>
      </Dropdown>
      <SettingsModal
        open={settingsOpen}
        onClose={() => {
          setSettingsOpen(false);
          window.dispatchEvent(new Event(MODELS_CHANGED_EVENT));
          void reloadModels();
        }}
      />
    </>
  );
}
