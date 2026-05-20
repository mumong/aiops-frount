import ChatWidget from './components/aiops-chat'
import styles from './App.module.css'

function App() {
  return (
    <div className={styles.container}>
      <ChatWidget
        apiBase="/api"
        title="k8s aiops"
      />
    </div>
  )
}

export default App
