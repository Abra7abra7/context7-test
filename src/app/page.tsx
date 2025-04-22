import AuthForm from '@/components/Auth'; // Import the AuthForm component

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 md:p-24">
      {/* Center the AuthForm and allow it to take necessary width */}
      <div className="w-full max-w-5xl">
          <AuthForm />
      </div>
    </main>
  );
}