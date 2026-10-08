import ChatWidget from './components/aiops-chat'
import styles from './App.module.css'
import { WorkspaceTheme } from './components/aiops-chat/WorkspaceTheme'

function App() {
  return (
    <WorkspaceTheme><div className={styles.container}>
      <ChatWidget
        apiBase="/api"
        title="k8s aiops"
      />
    </div></WorkspaceTheme>
  )
}

export default App
