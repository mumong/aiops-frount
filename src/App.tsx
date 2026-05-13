import ChatWidget from './components/aiops-chat'
import styles from './App.module.css'

function App() {
  return (
    <div className={styles.container}>
      <ChatWidget
        apiBase="/api"
        title="K8s AIOps Copilot"
        placeholder="输入你的运维问题，例如：我的集群有什么问题？"
      />
    </div>
  )
}

export default App
