'use client';

interface VideoPlayerProps {
  subscriptionTierPriceId: string | undefined | null;
}

// Mapping Price IDs to video counts
const videoAccess: { [key: string]: number } = {
  'price_1RGd8w4Gzz5zJfSKAjso7HIg': 1, // Basic
  'price_1RGd904Gzz5zJfSKpbBVyauh': 2, // Standard
  'price_1RGd9F4Gzz5zJfSKbljTm5A1': 3, // Premium
};

export default function VideoPlayer({ subscriptionTierPriceId }: VideoPlayerProps) {
  const numberOfVideos = subscriptionTierPriceId ? videoAccess[subscriptionTierPriceId] ?? 0 : 0;

  if (numberOfVideos === 0) {
    return <p>No active subscription found or invalid plan.</p>;
  }

  return (
    <div className="space-y-4">
      <h4 className="text-md font-medium">You have access to {numberOfVideos} video(s):</h4>
      {Array.from({ length: numberOfVideos }).map((_, index) => (
        <div key={index} className="border p-4 rounded bg-muted">
          <p>Fitness Video {index + 1}</p>
          {/* Replace with actual video embed/player component later */}
          <div className="aspect-video bg-gray-300 dark:bg-gray-700 flex items-center justify-center mt-2">
            <span className="text-gray-500">Video Placeholder</span>
          </div>
        </div>
      ))}
    </div>
  );
}
