import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { App, Button, ConfigProvider, Empty, Form, Input, List, Space, Typography, message, theme } from "antd";
import { DeleteOutlined, FolderOpenOutlined, PlusOutlined } from "@ant-design/icons";
import "antd/dist/reset.css";
import "./styles.css";

const { Text } = Typography;

function SkillSettings() {
  const [form] = Form.useForm();
  const [skills, setSkills] = useState([]);
  const [page, setPage] = useState("list");
  const [saving, setSaving] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();

  const sortedSkills = useMemo(() => skills, [skills]);

  useEffect(() => {
    let alive = true;
    window.pet.getSettings().then((settings) => {
      if (!alive) return;
      setSkills(Array.isArray(settings.skills) ? settings.skills : []);
    });
    return () => {
      alive = false;
    };
  }, []);

  async function persist(nextSkills, successText) {
    setSkills(nextSkills);
    setSaving(true);
    try {
      await window.pet.saveSettings({ skills: nextSkills });
      if (successText) messageApi.success(successText);
    } finally {
      setSaving(false);
    }
  }

  async function chooseFolder() {
    const folder = await window.pet.selectSkillFolder();
    if (!folder) return;
    form.setFieldsValue({
      path: folder.path,
      name: form.getFieldValue("name") || folder.name || ""
    });
  }

  async function addSkill() {
    const values = await form.validateFields();
    const folderPath = values.path.trim();
    const skillName = values.name?.trim() || getFolderName(folderPath) || "未命名技能";
    const existingIndex = skills.findIndex((skill) => skill.path === folderPath);
    const nextSkill = {
      id: existingIndex >= 0 ? skills[existingIndex].id : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name: skillName,
      path: folderPath
    };
    const nextSkills = [...skills];

    if (existingIndex >= 0) {
      nextSkills[existingIndex] = nextSkill;
      await persist(nextSkills, "已更新技能");
    } else {
      nextSkills.push(nextSkill);
      await persist(nextSkills, "已添加技能");
    }

    form.resetFields();
    setPage("list");
  }

  async function removeSkill(skill) {
    await persist(
      skills.filter((item) => item.id !== skill.id),
      "已移除技能"
    );
  }

  function openAddPage() {
    form.resetFields();
    setPage("add");
  }

  return (
    <App>
      {contextHolder}
      <main className="settings-shell">
        {page === "list" ? (
          <section className="skills-page">
            <div className="section-head">
              <Text className="section-title">已添加技能</Text>
              <Button aria-label="添加技能" icon={<PlusOutlined />} shape="circle" type="primary" onClick={openAddPage} />
            </div>

            <div className="skills-surface">
              {sortedSkills.length === 0 ? (
                <Empty description="还没有添加技能" image={Empty.PRESENTED_IMAGE_SIMPLE}>
                  <Button icon={<PlusOutlined />} type="primary" onClick={openAddPage}>
                    添加技能
                  </Button>
                </Empty>
              ) : (
                <List
                  className="skills-list"
                  dataSource={sortedSkills}
                  renderItem={(skill) => (
                    <List.Item
                      actions={[
                        <Button
                          aria-label={`移除 ${skill.name}`}
                          danger
                          icon={<DeleteOutlined />}
                          key="remove"
                          type="text"
                          onClick={() => removeSkill(skill)}
                        />
                      ]}
                    >
                      <List.Item.Meta
                        avatar={<div className="skill-avatar">技</div>}
                        title={<span className="skill-name">{skill.name}</span>}
                        description={<span className="skill-path">{skill.path}</span>}
                      />
                    </List.Item>
                  )}
                />
              )}
            </div>
          </section>
        ) : (
          <section className="editor-page">
            <div className="editor-surface">
              <Form form={form} layout="vertical" requiredMark={false}>
                <Form.Item label="技能名称" name="name">
                  <Input autoFocus placeholder="例如：图片生成" />
                </Form.Item>
                <Form.Item
                  label="技能文件夹"
                  name="path"
                  rules={[{ required: true, message: "请选择技能文件夹" }]}
                >
                  <Input readOnly placeholder="选择一个文件夹" />
                </Form.Item>
                <Button block icon={<FolderOpenOutlined />} onClick={chooseFolder}>
                  选择文件夹
                </Button>
              </Form>
            </div>

            <footer className="editor-actions">
              <Space>
                <Button onClick={() => setPage("list")}>取消</Button>
                <Button loading={saving} type="primary" onClick={addSkill}>
                  确认添加
                </Button>
              </Space>
            </footer>
          </section>
        )}
      </main>
    </App>
  );
}

function getFolderName(folderPath) {
  return String(folderPath || "")
    .split(/[\\/]/)
    .filter(Boolean)
    .pop();
}

createRoot(document.getElementById("root")).render(
  <ConfigProvider
    theme={{
      algorithm: theme.defaultAlgorithm,
      token: {
        borderRadius: 8,
        colorPrimary: "#2f7dd1",
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
      },
      components: {
        Button: {
          controlHeight: 34
        },
        Input: {
          controlHeight: 38
        }
      }
    }}
  >
    <SkillSettings />
  </ConfigProvider>
);
