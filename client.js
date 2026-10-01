// 侧栏只提供新标签入口；项目清单在独立页选择，保留原聊天。
window.__ModuleLoader__.load({
  id: '@specdev/dsh-workbench/client',
  factory(require) {
    const React = require('react')
    function ManageEntry() {
      return React.createElement('a', {
        href: '/specdev-workbench/workspaces',
        target: '_blank', rel: 'noopener',
        title: 'SpecDev 工作台', 'aria-label': 'SpecDev 工作台',
        style: { display: 'block', padding: '8px', width: '100%', color: 'inherit', textDecoration: 'none' },
      }, 'SpecDev 工作台 ↗')
    }
    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('sidebar.footer.action', () =>
          ctx.slots.register({ name: 'sidebar.footer.action', id: 'specdev-workbench', order: 100 }, ManageEntry))
      },
    }
  },
})
