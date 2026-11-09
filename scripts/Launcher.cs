using System;
using System.Diagnostics;
using System.IO;
using System.Net.Sockets;
using System.Threading;
using System.Windows.Forms;

namespace ProjectNotesApp
{
    static class Program
    {
        private static Process syncProcess = null;
        private static Process viteProcess = null;

        [STAThread]
        static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            Directory.SetCurrentDirectory(baseDir);

            // 1. Check if sync server is already listening on port 25860
            if (!IsPortInUse(25860))
            {
                syncProcess = StartBackgroundProcess("node", "scripts/sync-server.cjs", baseDir);
            }

            // 2. Check if Vite dev server is listening on port 5173
            if (!IsPortInUse(5173))
            {
                viteProcess = StartBackgroundProcess("cmd.exe", "/c pnpm run dev", baseDir);
                // Wait briefly for Vite server to spin up
                for (int i = 0; i < 20; i++)
                {
                    Thread.Sleep(250);
                    if (IsPortInUse(5173)) break;
                }
            }

            // 3. Find Microsoft Edge or Google Chrome
            string edgePath1 = @"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe";
            string edgePath2 = @"C:\Program Files\Microsoft\Edge\Application\msedge.exe";
            string chromePath = @"C:\Program Files\Google\Chrome\Application\chrome.exe";

            string browserPath = null;
            if (File.Exists(edgePath1)) browserPath = edgePath1;
            else if (File.Exists(edgePath2)) browserPath = edgePath2;
            else if (File.Exists(chromePath)) browserPath = chromePath;

            string targetUrl = "http://localhost:5173/";

            if (!string.IsNullOrEmpty(browserPath))
            {
                // Launch dedicated frameless application window
                ProcessStartInfo psi = new ProcessStartInfo(
                    browserPath,
                    "--app=" + targetUrl + " --window-size=1200,800"
                );
                psi.UseShellExecute = true;
                Process.Start(psi);
            }
            else
            {
                Process.Start(new ProcessStartInfo(targetUrl) { UseShellExecute = true });
            }
        }

        private static bool IsPortInUse(int port)
        {
            try
            {
                using (TcpClient client = new TcpClient())
                {
                    IAsyncResult result = client.BeginConnect("127.0.0.1", port, null, null);
                    bool success = result.AsyncWaitHandle.WaitOne(300);
                    if (success && client.Connected)
                    {
                        client.EndConnect(result);
                        return true;
                    }
                }
            }
            catch {}
            return false;
        }

        private static Process StartBackgroundProcess(string fileName, string args, string workingDir)
        {
            try
            {
                ProcessStartInfo psi = new ProcessStartInfo(fileName, args);
                psi.WorkingDirectory = workingDir;
                psi.CreateNoWindow = true;
                psi.WindowStyle = ProcessWindowStyle.Hidden;
                psi.UseShellExecute = false;
                return Process.Start(psi);
            }
            catch
            {
                return null;
            }
        }
    }
}
