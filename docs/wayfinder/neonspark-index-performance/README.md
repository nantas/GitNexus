# neonspark 性能验证记录

当前工作树的已验收行为以 [baseline-current.json](baseline-current.json) 和 [neonnew-rebaseline.md](neonnew-rebaseline.md) 为准：基准输入仓已切换为 neonnew，阶段锚点复现旧基线，端到端完整 wall 在当前环境下被噪声支配。完整构建 180 秒目标尚未达成。

1.6.13 发布准备仅整理版本与格式；性能测量仍属于原始 1.6.12 开发构建。发布产物另记录哈希，不冒充重新测量。详情见 [发布准备](../../releases/1.6.13-preparation.md)。

记录中的 `$GITNEXUS_REPO`、`$NEONSPARK_REPO`、`$NEONNEW_REPO`、`$NEONSPARK_SOURCE_REALPATH`、`$NODE24` 是机器路径占位符。路径展示已标准化，原始日志在本地 `.scratch/` 保留；测量结果、源码哈希与原始证据哈希不变。JSON 中的占位符需替换后才能作为命令参数使用。

Git 仅收录轻量说明、结果与哈希。实验数据库、解析缓存已回收；完整关系差异、逐文件哈希及原始日志位于各报告注明的本地证据目录，不进入 npm 包。
